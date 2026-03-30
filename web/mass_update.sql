UPDATE cabinet_products
SET 
  accessory_text = CASE
    WHEN line ILIKE 'CLASS' THEN CASE
      WHEN cabinet_name ILIKE '%GODAI%' OR cabinet_name ILIKE '%GODÁI%' THEN
        CASE WHEN sap_name || ' ' || sap_description ILIKE '%CUBO CAJON%' OR sap_name || ' ' || sap_description ILIKE '%CUBO CAJÓN%' OR sap_name || ' ' || sap_description ILIKE '%CUBO-CAJON%' THEN 'RFE CIERRE LENTO' ELSE '' END
      WHEN cabinet_name ILIKE '%VITELLI%' THEN 'R OCULTO CIERRE LENTO'
      WHEN cabinet_name ILIKE '%GRECO%' THEN 'RFE + R OCULTO CIERRE LENTO'
      WHEN cabinet_name ILIKE '%MACAO%' THEN 'RFE CIERRE LENTO'
      WHEN cabinet_name ILIKE '%MISUS%' THEN 'R OCULTO CIERRE LENTO'
      WHEN cabinet_name ILIKE '%THALOS%' THEN 'RFE CIERRE LENTO'
      WHEN cabinet_name ILIKE '%OTUS%' THEN 'RFE CIERRE LENTO'
      WHEN cabinet_name ILIKE '%ZACURA%' THEN 'RFE CIERRE LENTO'
      ELSE accessory_text
    END
    WHEN line ILIKE 'LIFE' THEN CASE
      WHEN cabinet_name ILIKE '%MACAO%' THEN 'RFE'
      WHEN cabinet_name ILIKE '%TIZIANO%' THEN 'RFE'
      WHEN cabinet_name ILIKE '%MISUS%' THEN 'RFE'
      WHEN cabinet_name ILIKE '%MONET%' THEN 'RFE'
      WHEN cabinet_name ILIKE '%VALDEZ%' THEN 'RFE'
      WHEN cabinet_name ILIKE '%DA VINCI%' THEN ''
      WHEN cabinet_name ILIKE '%POLOCK%' THEN ''
      WHEN cabinet_name ILIKE '%PICASSO%' THEN 'RFE'
      ELSE accessory_text
    END
    WHEN line ILIKE 'ESSENTIAL' OR line ILIKE 'EUROCARIBE' THEN CASE
      WHEN cabinet_name ILIKE '%VEGA%' THEN ''
      WHEN cabinet_name ILIKE '%VAN GOGH%' THEN ''
      WHEN cabinet_name ILIKE '%CALDER%' THEN ''
      WHEN cabinet_name ILIKE '%BASICO%' OR cabinet_name ILIKE '%BÁSICO%' OR cabinet_name ILIKE '%BÁSICOS%' THEN
        CASE WHEN sap_name || ' ' || sap_description ILIKE '%SIN MANIJA%' THEN 'SIN MANIJAS' ELSE 'CON MANIJAS' END
      WHEN cabinet_name ILIKE '%RAYO%' THEN ''
      WHEN cabinet_name ILIKE '%ELEVADO%' THEN 'TAPA VESSEL'
      WHEN cabinet_name ILIKE '%A PISO%' THEN 'TAPA VESSEL'
      ELSE accessory_text
    END
    ELSE accessory_text
  END,
  
  designation = CASE
    WHEN line ILIKE 'CLASS' THEN CASE
      WHEN cabinet_name ILIKE '%GODAI%' OR cabinet_name ILIKE '%GODÁI%' THEN
        CASE WHEN sap_name || ' ' || sap_description ILIKE '%CUBO CAJON%' OR sap_name || ' ' || sap_description ILIKE '%CUBO CAJÓN%' OR sap_name || ' ' || sap_description ILIKE '%CUBO-CAJON%' THEN 'ELEVADO' ELSE designation END
      WHEN cabinet_name ILIKE '%VITELLI%' THEN 'ELEVADO'
      WHEN cabinet_name ILIKE '%GRECO%' THEN 'ELEVADO'
      WHEN cabinet_name ILIKE '%MACAO%' THEN 'ELEVADO'
      WHEN cabinet_name ILIKE '%MISUS%' THEN 'ELEVADO'
      WHEN cabinet_name ILIKE '%THALOS%' THEN 'ELEVADO'
      WHEN cabinet_name ILIKE '%OTUS%' THEN 'A PISO'
      WHEN cabinet_name ILIKE '%ZACURA%' THEN 'ELEVADO'
      ELSE designation
    END
    WHEN line ILIKE 'LIFE' THEN CASE
      WHEN cabinet_name ILIKE '%MACAO%' THEN 'ELEVADO'
      WHEN cabinet_name ILIKE '%TIZIANO%' THEN 'ELEVADO'
      WHEN cabinet_name ILIKE '%MISUS%' THEN 'ELEVADO'
      WHEN cabinet_name ILIKE '%MONET%' THEN 'ELEVADO'
      WHEN cabinet_name ILIKE '%VALDEZ%' THEN
        CASE WHEN sap_name || ' ' || sap_description ILIKE '%A PISO%' THEN 'A PISO' ELSE 'ELEVADO' END
      WHEN cabinet_name ILIKE '%DA VINCI%' THEN 'A PISO'
      WHEN cabinet_name ILIKE '%POLOCK%' THEN 'A PISO'
      WHEN cabinet_name ILIKE '%PICASSO%' THEN 'ELEVADO'
      ELSE designation
    END
    WHEN line ILIKE 'ESSENTIAL' OR line ILIKE 'EUROCARIBE' THEN CASE
      WHEN cabinet_name ILIKE '%VEGA%' THEN 'A PISO'
      WHEN cabinet_name ILIKE '%VAN GOGH%' THEN 'ELEVADO'
      WHEN cabinet_name ILIKE '%CALDER%' THEN 'ELEVADO'
      WHEN cabinet_name ILIKE '%BASICO%' OR cabinet_name ILIKE '%BÁSICO%' OR cabinet_name ILIKE '%BÁSICOS%' THEN
        CASE WHEN sap_name || ' ' || sap_description ILIKE '%A PISO%' THEN 'A PISO' ELSE 'ELEVADO' END
      WHEN cabinet_name ILIKE '%RAYO%' THEN 'ELEVADO'
      WHEN cabinet_name ILIKE '%ELEVADO%' THEN 'ELEVADO'
      WHEN cabinet_name ILIKE '%A PISO%' THEN 'A PISO'
      ELSE designation
    END
    ELSE designation
  END;
