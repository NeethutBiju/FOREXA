-- FOREXA BigQuery DDL (Dataset: forexa_kerala, Region: asia-south1)
CREATE SCHEMA IF NOT EXISTS `forexa_kerala` OPTIONS(location="asia-south1");

CREATE TABLE IF NOT EXISTS `forexa_kerala.weights` (
  init_time TIMESTAMP,
  valid_time TIMESTAMP,
  lead_h INT64,
  district STRING,
  district_id STRING,
  season STRING,
  regime STRING,
  split STRING,
  pred_err_nwp FLOAT64,
  pred_err_ensemble FLOAT64,
  pred_err_ai FLOAT64,
  raw_w_nwp FLOAT64,
  raw_w_ensemble FLOAT64,
  raw_w_ai FLOAT64,
  w_nwp FLOAT64,
  w_ensemble FLOAT64,
  w_ai FLOAT64,
  active_nwp BOOL,
  active_ensemble BOOL,
  active_ai BOOL,
  pred_err_blend FLOAT64,
  evidence STRING,
  weighting_method STRING,
  model_version STRING
)
PARTITION BY DATE(init_time)
CLUSTER BY district, lead_h;

CREATE TABLE IF NOT EXISTS `forexa_kerala.blended` (
  init_time TIMESTAMP,
  valid_time TIMESTAMP,
  lead_h INT64,
  district STRING,
  district_id STRING,
  season STRING,
  regime STRING,
  split STRING,
  n_sources INT64,
  status STRING,
  fallback_reason STRING,
  confidence STRING,
  confidence_score FLOAT64,
  confidence_explanation STRING,
  disagreement FLOAT64,
  pred_err_blend FLOAT64,
  weighting_method STRING,
  model_version STRING,
  temp_c__blend FLOAT64,
  precip_6h_mm__blend FLOAT64,
  humidity_pct__blend FLOAT64,
  wind_ms__blend FLOAT64,
  pressure_hpa__blend FLOAT64,
  eff_w_nwp FLOAT64,
  eff_w_ensemble FLOAT64,
  eff_w_ai FLOAT64
)
PARTITION BY DATE(valid_time)
CLUSTER BY district, lead_h;
