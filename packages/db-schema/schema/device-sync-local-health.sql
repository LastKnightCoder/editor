SELECT 'local-generation' AS damaged WHERE
  (SELECT count(*) FROM pragma_table_info('_tau_device_local'))<>2
  OR NOT EXISTS(SELECT 1 FROM pragma_table_info('_tau_device_local') WHERE name='id' AND upper(type)='INTEGER' AND pk=1)
  OR NOT EXISTS(SELECT 1 FROM pragma_table_info('_tau_device_local') WHERE name='generation' AND upper(type)='TEXT' AND "notnull"=1)
  OR (SELECT count(*) FROM _tau_device_local)<>1
  OR EXISTS(SELECT 1 FROM _tau_device_local WHERE id<>1 OR typeof(generation)<>'text' OR NOT (
    generation='' OR (
      length(generation)=36 AND substr(generation,9,1)='-' AND substr(generation,14,1)='-'
      AND substr(generation,19,1)='-' AND substr(generation,24,1)='-'
      AND length(replace(generation,'-',''))=32 AND replace(generation,'-','') NOT GLOB '*[^0-9a-f]*'
    )
  ));
