SET NOCOUNT ON;

/*
    COSTO VIGENTE PARA COTIZACION

    Compatible con versiones antiguas de SQL Server:
    - No usa TRY_CONVERT.
    - No usa STRING_SPLIT.
    - No usa JSON_VALUE.

    Politica de seleccion:
    1. Costo de importacion OIPF/IPF1 que sustituye su compra base.
    2. Factura de proveedor OPCH/PCH1 que sustituye su entrada base.
    3. Entrada de mercancia OPDN/PDN1 como costo provisional.
    4. Promedio vigente de MP-01 como fallback.

    Entre cadenas de compra diferentes siempre gana el evento mas reciente.
    En la misma fecha: LANDED_COST > AP_INVOICE > GRPO.
*/

DECLARE @FromDate datetime;
SET @FromDate = '20000101';

DECLARE @FallbackWarehouse nvarchar(8);
SET @FallbackWarehouse = N'MP-01';

DECLARE @Items TABLE
(
    ItemCode nvarchar(50) NOT NULL PRIMARY KEY
);

/*
    Para probar manualmente, sustituir o ampliar estos códigos.
    En el API, insertar aquí únicamente parámetros SQL enlazados; no concatenar
    códigos recibidos directamente dentro del texto SQL.
*/
INSERT INTO @Items (ItemCode)
VALUES
    (N'CMPD01-0016-000-0000'),
    (N'CMPD01-0048-000-0000');

;WITH LandedCostCandidates AS
(
    SELECT
        L.ItemCode AS item_code,
        CAST('LANDED_COST' AS varchar(30)) AS cost_source,
        1 AS source_priority,
        CAST('N' AS char(1)) AS is_provisional,
        H.DocDate AS cost_date,
        H.DocEntry AS document_entry,
        H.DocNum AS document_number,
        L.LineNum AS document_line,
        L.WhsCode AS warehouse_code,

        COALESCE(H.CardCode, BaseGRPO.CardCode, L.CardCode) AS partner_code,
        COALESCE(BP.CardName, BaseGRPO.CardName) AS partner_name,
        COALESCE(BaseGRPO.NumAtCard, L.Reference) AS supplier_document,

        CASE
            WHEN L.OriBDocTyp = '20' AND L.OriBAbsEnt > 0 THEN 20
            ELSE L.BaseType
        END AS base_type,
        CASE
            WHEN L.OriBDocTyp = '20' AND L.OriBAbsEnt > 0 THEN L.OriBAbsEnt
            ELSE L.BaseEntry
        END AS base_entry,
        CASE
            WHEN L.OriBDocTyp = '20' AND L.OriBLinNum >= 0 THEN L.OriBLinNum
            ELSE L.OrigLine
        END AS base_line,

        CONVERT(numeric(19,6), L.Quantity) AS document_quantity,
        CONVERT(numeric(19,6), L.InvQty) AS inventory_quantity,
        CAST(I.BuyUnitMsr AS nvarchar(100)) AS document_uom,
        CAST(L.Currency AS nvarchar(3)) AS document_currency,
        CONVERT(numeric(19,6), L.Rate) AS document_exchange_rate,
        CONVERT(numeric(19,6), L.PriceAtWH) AS document_unit_price,
        CAST(NULL AS numeric(19,6)) AS document_discount_percent,
        CONVERT(numeric(19,6), L.LineTotal) AS line_total_local,
        CONVERT(numeric(19,6), L.LineTotal / NULLIF(L.InvQty, 0))
            AS cost_per_inventory_uom,
        CAST(NULL AS nvarchar(254)) AS document_comments

    FROM OIPF H

    INNER JOIN IPF1 L
        ON L.DocEntry = H.DocEntry

    INNER JOIN @Items S
        ON S.ItemCode = L.ItemCode

    INNER JOIN OITM I
        ON I.ItemCode = L.ItemCode

    LEFT JOIN OPDN BaseGRPO
        ON BaseGRPO.DocEntry =
            CASE
                WHEN L.OriBDocTyp = '20' AND L.OriBAbsEnt > 0
                    THEN L.OriBAbsEnt
                WHEN L.BaseType = 20
                    THEN L.BaseEntry
                ELSE NULL
            END

    LEFT JOIN OCRD BP
        ON BP.CardCode = COALESCE(H.CardCode, BaseGRPO.CardCode, L.CardCode)

    WHERE H.DocDate >= @FromDate
      AND ISNULL(H.CANCELED, 'N') <> 'Y'
      AND L.InvQty > 0
      AND L.LineTotal > 0
      AND ISNULL(L.StockEval, 'Y') = 'Y'
),
ApInvoiceCandidates AS
(
    SELECT
        L.ItemCode AS item_code,
        CAST('AP_INVOICE' AS varchar(30)) AS cost_source,
        2 AS source_priority,
        CAST('N' AS char(1)) AS is_provisional,
        H.DocDate AS cost_date,
        H.DocEntry AS document_entry,
        H.DocNum AS document_number,
        L.LineNum AS document_line,
        L.WhsCode AS warehouse_code,

        H.CardCode AS partner_code,
        H.CardName AS partner_name,
        H.NumAtCard AS supplier_document,

        L.BaseType AS base_type,
        L.BaseEntry AS base_entry,
        L.BaseLine AS base_line,

        CONVERT(numeric(19,6), L.Quantity) AS document_quantity,
        CONVERT(numeric(19,6), L.InvQty) AS inventory_quantity,
        CAST(L.unitMsr AS nvarchar(100)) AS document_uom,
        CAST(L.Currency AS nvarchar(3)) AS document_currency,
        CONVERT(numeric(19,6), L.Rate) AS document_exchange_rate,
        CONVERT(numeric(19,6), L.PriceBefDi) AS document_unit_price,
        CONVERT(numeric(19,6), L.DiscPrcnt) AS document_discount_percent,
        CONVERT(numeric(19,6), L.LineTotal) AS line_total_local,
        CONVERT(numeric(19,6), L.LineTotal / NULLIF(L.InvQty, 0))
            AS cost_per_inventory_uom,
        CAST(H.Comments AS nvarchar(254)) AS document_comments

    FROM OPCH H

    INNER JOIN PCH1 L
        ON L.DocEntry = H.DocEntry

    INNER JOIN @Items S
        ON S.ItemCode = L.ItemCode

    WHERE H.DocDate >= @FromDate
      AND H.DocType = 'I'
      AND H.CANCELED = 'N'
      AND L.InvQty > 0
      AND L.LineTotal > 0

      /*
          Si esta factura ya fue absorbida por un costo de importacion,
          el costo final es IPF1 y no la factura FOB/base.
      */
      AND NOT EXISTS
      (
          SELECT 1
          FROM OIPF LH
          INNER JOIN IPF1 LL
              ON LL.DocEntry = LH.DocEntry
          WHERE ISNULL(LH.CANCELED, 'N') <> 'Y'
            AND LL.ItemCode = L.ItemCode
            AND LL.InvQty > 0
            AND LL.LineTotal > 0
            AND ISNULL(LL.StockEval, 'Y') = 'Y'
            AND
            (
                (
                    LL.BaseType = 18
                    AND LL.BaseEntry = H.DocEntry
                    AND LL.OrigLine = L.LineNum
                )
                OR
                (
                    L.BaseType = 20
                    AND
                    (
                        (
                            LL.BaseType = 20
                            AND LL.BaseEntry = L.BaseEntry
                            AND LL.OrigLine = L.BaseLine
                        )
                        OR
                        (
                            LL.OriBDocTyp = '20'
                            AND LL.OriBAbsEnt = L.BaseEntry
                            AND LL.OriBLinNum = L.BaseLine
                        )
                    )
                )
            )
      )
),
GrpoCandidates AS
(
    SELECT
        L.ItemCode AS item_code,
        CAST('GRPO' AS varchar(30)) AS cost_source,
        3 AS source_priority,
        CAST('Y' AS char(1)) AS is_provisional,
        H.DocDate AS cost_date,
        H.DocEntry AS document_entry,
        H.DocNum AS document_number,
        L.LineNum AS document_line,
        L.WhsCode AS warehouse_code,

        H.CardCode AS partner_code,
        H.CardName AS partner_name,
        H.NumAtCard AS supplier_document,

        L.BaseType AS base_type,
        L.BaseEntry AS base_entry,
        L.BaseLine AS base_line,

        CONVERT(numeric(19,6), L.Quantity) AS document_quantity,
        CONVERT(numeric(19,6), L.InvQty) AS inventory_quantity,
        CAST(L.unitMsr AS nvarchar(100)) AS document_uom,
        CAST(L.Currency AS nvarchar(3)) AS document_currency,
        CONVERT(numeric(19,6), L.Rate) AS document_exchange_rate,
        CONVERT(numeric(19,6), L.PriceBefDi) AS document_unit_price,
        CONVERT(numeric(19,6), L.DiscPrcnt) AS document_discount_percent,
        CONVERT(numeric(19,6), L.LineTotal) AS line_total_local,
        CONVERT(numeric(19,6), L.LineTotal / NULLIF(L.InvQty, 0))
            AS cost_per_inventory_uom,
        CAST(H.Comments AS nvarchar(254)) AS document_comments

    FROM OPDN H

    INNER JOIN PDN1 L
        ON L.DocEntry = H.DocEntry

    INNER JOIN @Items S
        ON S.ItemCode = L.ItemCode

    WHERE H.DocDate >= @FromDate
      AND H.DocType = 'I'
      AND H.CANCELED = 'N'
      AND L.InvQty > 0
      AND L.LineTotal > 0

      /* Una factura valida sustituye el costo provisional de la entrada. */
      AND NOT EXISTS
      (
          SELECT 1
          FROM OPCH IH
          INNER JOIN PCH1 IL
              ON IL.DocEntry = IH.DocEntry
          WHERE IH.CANCELED = 'N'
            AND IH.DocType = 'I'
            AND IL.ItemCode = L.ItemCode
            AND IL.BaseType = 20
            AND IL.BaseEntry = H.DocEntry
            AND IL.BaseLine = L.LineNum
            AND IL.InvQty > 0
            AND IL.LineTotal > 0
      )

      /* Un costo de importacion valido sustituye la entrada base. */
      AND NOT EXISTS
      (
          SELECT 1
          FROM OIPF LH
          INNER JOIN IPF1 LL
              ON LL.DocEntry = LH.DocEntry
          WHERE ISNULL(LH.CANCELED, 'N') <> 'Y'
            AND LL.ItemCode = L.ItemCode
            AND LL.InvQty > 0
            AND LL.LineTotal > 0
            AND ISNULL(LL.StockEval, 'Y') = 'Y'
            AND
            (
                (
                    LL.BaseType = 20
                    AND LL.BaseEntry = H.DocEntry
                    AND LL.OrigLine = L.LineNum
                )
                OR
                (
                    LL.OriBDocTyp = '20'
                    AND LL.OriBAbsEnt = H.DocEntry
                    AND LL.OriBLinNum = L.LineNum
                )
            )
      )
),
CostCandidates AS
(
    SELECT * FROM LandedCostCandidates
    UNION ALL
    SELECT * FROM ApInvoiceCandidates
    UNION ALL
    SELECT * FROM GrpoCandidates
),
RankedCosts AS
(
    SELECT
        C.*,
        ROW_NUMBER() OVER
        (
            PARTITION BY C.item_code
            ORDER BY
                C.cost_date DESC,
                C.source_priority ASC,
                C.document_entry DESC,
                C.document_line DESC
        ) AS cost_rank
    FROM CostCandidates C
)
SELECT
    S.ItemCode AS item_code,
    I.ItemName AS item_name,
    I.PrchseItem AS is_purchase_item,
    I.InvntItem AS is_inventory_item,
    I.PrcrmntMtd AS procurement_method,

    I.InvntryUom AS inventory_uom,
    I.BuyUnitMsr AS purchase_uom,
    CONVERT(numeric(19,6), I.NumInBuy)
        AS inventory_units_per_purchase_uom,

    CASE
        WHEN I.ItemCode IS NULL
            THEN 'ITEM_NOT_FOUND'
        WHEN ISNULL(I.PrchseItem, 'N') <> 'Y'
          OR ISNULL(I.PrcrmntMtd, 'M') = 'M'
            THEN 'REQUIRES_BOM_ROLLUP'
        WHEN R.item_code IS NOT NULL
            THEN 'COST_FOUND'
        WHEN W.AvgPrice > 0
            THEN 'FALLBACK_WAREHOUSE_AVERAGE'
        ELSE 'NO_COST_FOUND'
    END AS cost_status,

    CASE
        WHEN I.ItemCode IS NULL
            THEN NULL
        WHEN ISNULL(I.PrchseItem, 'N') <> 'Y'
          OR ISNULL(I.PrcrmntMtd, 'M') = 'M'
            THEN 'BOM_ROLLUP'
        WHEN R.item_code IS NOT NULL
            THEN R.cost_source
        WHEN W.AvgPrice > 0
            THEN 'WAREHOUSE_AVERAGE'
        ELSE 'NO_COST'
    END AS cost_source,

    CASE
        WHEN I.ItemCode IS NULL
            THEN NULL
        WHEN ISNULL(I.PrchseItem, 'N') <> 'Y'
          OR ISNULL(I.PrcrmntMtd, 'M') = 'M'
            THEN NULL
        WHEN R.item_code IS NOT NULL
            THEN R.cost_per_inventory_uom
        WHEN W.AvgPrice > 0
            THEN CONVERT(numeric(19,6), W.AvgPrice)
        ELSE NULL
    END AS cost_per_inventory_uom,

    CASE
        WHEN I.ItemCode IS NULL
            THEN NULL
        WHEN ISNULL(I.PrchseItem, 'N') <> 'Y'
          OR ISNULL(I.PrcrmntMtd, 'M') = 'M'
            THEN NULL
        WHEN R.item_code IS NOT NULL
            THEN CONVERT
            (
                numeric(19,6),
                R.cost_per_inventory_uom
                * CASE
                    WHEN I.NumInBuy > 0 THEN I.NumInBuy
                    ELSE 1
                  END
            )
        WHEN W.AvgPrice > 0
            THEN CONVERT
            (
                numeric(19,6),
                W.AvgPrice
                * CASE
                    WHEN I.NumInBuy > 0 THEN I.NumInBuy
                    ELSE 1
                  END
            )
        ELSE NULL
    END AS cost_per_purchase_uom,

    CAST('LOCAL_CURRENCY' AS varchar(20)) AS cost_currency_scope,
    R.is_provisional,
    R.cost_date,
    CASE
        WHEN R.cost_date IS NOT NULL
            THEN DATEDIFF(day, R.cost_date, GETDATE())
        ELSE NULL
    END AS cost_age_days,

    R.document_entry,
    R.document_number,
    R.document_line,
    R.warehouse_code,
    R.partner_code,
    R.partner_name,
    R.supplier_document,
    R.base_type,
    R.base_entry,
    R.base_line,

    R.document_quantity,
    R.inventory_quantity,
    R.document_uom,
    R.document_currency,
    R.document_exchange_rate,
    R.document_unit_price,
    R.document_discount_percent,
    R.line_total_local,
    R.document_comments,

    @FallbackWarehouse AS fallback_warehouse,
    CONVERT(numeric(19,6), W.OnHand) AS fallback_warehouse_on_hand,
    CONVERT(numeric(19,6), W.AvgPrice) AS fallback_warehouse_average_cost,

    CASE
        WHEN I.ItemCode IS NULL
            THEN 'El codigo no existe en OITM.'
        WHEN ISNULL(I.PrchseItem, 'N') <> 'Y'
          OR ISNULL(I.PrcrmntMtd, 'M') = 'M'
            THEN 'No usar costo directo. Expandir y costear los hijos de la LdM.'
        WHEN R.cost_source = 'GRPO'
            THEN 'Costo provisional: aun puede cambiar con factura o costos de importacion.'
        WHEN R.item_code IS NULL AND W.AvgPrice > 0
            THEN 'No se encontro documento valido. Se usa promedio vigente de MP-01.'
        WHEN R.item_code IS NULL
            THEN 'No se encontro costo documental ni promedio de bodega utilizable.'
        ELSE NULL
    END AS cost_warning

FROM @Items S

LEFT JOIN OITM I
    ON I.ItemCode = S.ItemCode

LEFT JOIN RankedCosts R
    ON R.item_code = S.ItemCode
   AND R.cost_rank = 1

LEFT JOIN OITW W
    ON W.ItemCode = S.ItemCode
   AND W.WhsCode = @FallbackWarehouse

ORDER BY S.ItemCode;
