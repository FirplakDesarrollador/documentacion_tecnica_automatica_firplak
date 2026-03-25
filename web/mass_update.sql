UPDATE cabinet_products
SET 
  accessory_text = CASE
    WHEN line ILIKE 'CLASS' THEN CASE
      WHEN furniture_name ILIKE '%GODAI%' OR furniture_name ILIKE '%GODÁI%' THEN
        CASE WHEN sap_name || ' ' || sap_description ILIKE '%CUBO CAJON%' OR sap_name || ' ' || sap_description ILIKE '%CUBO CAJÓN%' OR sap_name || ' ' || sap_description ILIKE '%CUBO-CAJON%' THEN 'RFE CIERRE LENTO' ELSE '' END
      WHEN furniture_name ILIKE '%VITELLI%' THEN 'R OCULTO CIERRE LENTO'
      WHEN furniture_name ILIKE '%GRECO%' THEN 'RFE + R OCULTO CIERRE LENTO'
      WHEN furniture_name ILIKE '%MACAO%' THEN 'RFE CIERRE LENTO'
      WHEN furniture_name ILIKE '%MISUS%' THEN 'R OCULTO CIERRE LENTO'
      WHEN furniture_name ILIKE '%THALOS%' THEN 'RFE CIERRE LENTO'
      WHEN furniture_name ILIKE '%OTUS%' THEN 'RFE CIERRE LENTO'
      WHEN furniture_name ILIKE '%ZACURA%' THEN 'RFE CIERRE LENTO'
      ELSE accessory_text
    END
    WHEN line ILIKE 'LIFE' THEN CASE
      WHEN furniture_name ILIKE '%MACAO%' THEN 'RFE'
      WHEN furniture_name ILIKE '%TIZIANO%' THEN 'RFE'
      WHEN furniture_name ILIKE '%MISUS%' THEN 'RFE'
      WHEN furniture_name ILIKE '%MONET%' THEN 'RFE'
      WHEN furniture_name ILIKE '%VALDEZ%' THEN 'RFE'
      WHEN furniture_name ILIKE '%DA VINCI%' THEN ''
      WHEN furniture_name ILIKE '%POLOCK%' THEN ''
      WHEN furniture_name ILIKE '%PICASSO%' THEN 'RFE'
      ELSE accessory_text
    END
    WHEN line ILIKE 'ESSENTIAL' OR line ILIKE 'EUROCARIBE' THEN CASE
      WHEN furniture_name ILIKE '%VEGA%' THEN ''
      WHEN furniture_name ILIKE '%VAN GOGH%' THEN ''
      WHEN furniture_name ILIKE '%CALDER%' THEN ''
      WHEN furniture_name ILIKE '%BASICO%' OR furniture_name ILIKE '%BÁSICO%' OR furniture_name ILIKE '%BÁSICOS%' THEN
        CASE WHEN sap_name || ' ' || sap_description ILIKE '%SIN MANIJA%' THEN 'SIN MANIJAS' ELSE 'CON MANIJAS' END
      WHEN furniture_name ILIKE '%RAYO%' THEN ''
      WHEN furniture_name ILIKE '%ELEVADO%' THEN 'TAPA VESSEL'
      WHEN furniture_name ILIKE '%A PISO%' THEN 'TAPA VESSEL'
      ELSE accessory_text
    END
    ELSE accessory_text
  END,
  
  designation = CASE
    WHEN line ILIKE 'CLASS' THEN CASE
      WHEN furniture_name ILIKE '%GODAI%' OR furniture_name ILIKE '%GODÁI%' THEN
        CASE WHEN sap_name || ' ' || sap_description ILIKE '%CUBO CAJON%' OR sap_name || ' ' || sap_description ILIKE '%CUBO CAJÓN%' OR sap_name || ' ' || sap_description ILIKE '%CUBO-CAJON%' THEN 'ELEVADO' ELSE designation END
      WHEN furniture_name ILIKE '%VITELLI%' THEN 'ELEVADO'
      WHEN furniture_name ILIKE '%GRECO%' THEN 'ELEVADO'
      WHEN furniture_name ILIKE '%MACAO%' THEN 'ELEVADO'
      WHEN furniture_name ILIKE '%MISUS%' THEN 'ELEVADO'
      WHEN furniture_name ILIKE '%THALOS%' THEN 'ELEVADO'
      WHEN furniture_name ILIKE '%OTUS%' THEN 'A PISO'
      WHEN furniture_name ILIKE '%ZACURA%' THEN 'ELEVADO'
      ELSE designation
    END
    WHEN line ILIKE 'LIFE' THEN CASE
      WHEN furniture_name ILIKE '%MACAO%' THEN 'ELEVADO'
      WHEN furniture_name ILIKE '%TIZIANO%' THEN 'ELEVADO'
      WHEN furniture_name ILIKE '%MISUS%' THEN 'ELEVADO'
      WHEN furniture_name ILIKE '%MONET%' THEN 'ELEVADO'
      WHEN furniture_name ILIKE '%VALDEZ%' THEN
        CASE WHEN sap_name || ' ' || sap_description ILIKE '%A PISO%' THEN 'A PISO' ELSE 'ELEVADO' END
      WHEN furniture_name ILIKE '%DA VINCI%' THEN 'A PISO'
      WHEN furniture_name ILIKE '%POLOCK%' THEN 'A PISO'
      WHEN furniture_name ILIKE '%PICASSO%' THEN 'ELEVADO'
      ELSE designation
    END
    WHEN line ILIKE 'ESSENTIAL' OR line ILIKE 'EUROCARIBE' THEN CASE
      WHEN furniture_name ILIKE '%VEGA%' THEN 'A PISO'
      WHEN furniture_name ILIKE '%VAN GOGH%' THEN 'ELEVADO'
      WHEN furniture_name ILIKE '%CALDER%' THEN 'ELEVADO'
      WHEN furniture_name ILIKE '%BASICO%' OR furniture_name ILIKE '%BÁSICO%' OR furniture_name ILIKE '%BÁSICOS%' THEN
        CASE WHEN sap_name || ' ' || sap_description ILIKE '%A PISO%' THEN 'A PISO' ELSE 'ELEVADO' END
      WHEN furniture_name ILIKE '%RAYO%' THEN 'ELEVADO'
      WHEN furniture_name ILIKE '%ELEVADO%' THEN 'ELEVADO'
      WHEN furniture_name ILIKE '%A PISO%' THEN 'A PISO'
      ELSE designation
    END
    ELSE designation
  END;
