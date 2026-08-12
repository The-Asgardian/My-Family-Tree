-- Local/hosted verification briefly created and immediately removed a
-- permission-test person. Keep audit history free of that non-family record.
delete from public.change_log
where before_data ->> 'full_name' = 'Production Permission Test'
   or after_data ->> 'full_name' = 'Production Permission Test';
