-- Scotch whisky exports from HMRC Overseas Trade Statistics (uktradeinfo.com, Open Government Licence v3.0).
-- One row per month x destination country x segment. Values as published (GBP, litres of pure alcohol).
CREATE TABLE trade_exports (
  month INTEGER NOT NULL,            -- YYYYMM
  country_id INTEGER NOT NULL,       -- HMRC CountryId
  country_name TEXT,
  country_alpha TEXT,                -- ISO alpha-2, e.g. HK, TW
  segment TEXT NOT NULL,             -- all_scotch, single_malt
  value_gbp INTEGER NOT NULL,
  lpa INTEGER,                       -- supplementary unit: litres of pure alcohol
  PRIMARY KEY (month, country_id, segment)
);
CREATE INDEX idx_trade_segment_month ON trade_exports(segment, month);
