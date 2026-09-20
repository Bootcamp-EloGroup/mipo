-- O checkout agora registra incompatibilidade de preferência como um estado
-- próprio. Estoque continua fora do cálculo de recomendação.
alter table public.mipo_interventions drop constraint if exists mipo_interventions_risk_type_check;
alter table public.mipo_interventions add constraint mipo_interventions_risk_type_check
  check (risk_type in ('size','quality','preference_mismatch','stock','none','insufficient_evidence'));
