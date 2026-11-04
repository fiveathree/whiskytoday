-- Seed news sources (PLAN.md §4.6). Each feed was checked on 2026-11-04:
-- returns a public RSS/Atom document with recent items. Rejected candidates are listed in docs/SOURCES.md.

INSERT INTO sources (id, name, home_url, feed_url, region, language, kind, filter_keywords) VALUES
('whiskynotes',        'WhiskyNotes',                        'https://www.whiskynotes.be',            'https://www.whiskynotes.be/feed/',                         'scotland', 'en', 'blog',     NULL),
('whiskyforeveryone',  'Whisky for Everyone',                'https://whiskyforeveryone.blogspot.com', 'https://whiskyforeveryone.blogspot.com/feeds/posts/default','scotland', 'en', 'blog',     NULL),
('whiskycast',         'WhiskyCast',                         'https://whiskycast.com',                'https://whiskycast.com/feed/',                             'other',    'en', 'news',     NULL),
('whiskyintelligence', 'Whisky Intelligence',                'https://www.whiskyintelligence.com',    'https://www.whiskyintelligence.com/feed/',                 'scotland', 'en', 'news',     NULL),
('rarewhisky101',      'Rare Whisky 101',                    'https://www.rarewhisky101.com',         'https://www.rarewhisky101.com/feed',                       'scotland', 'en', 'news',     NULL),
('whiskyandwisdom',    'Whisky and Wisdom',                  'https://www.whiskyandwisdom.com',       'https://www.whiskyandwisdom.com/feed/',                    'scotland', 'en', 'blog',     NULL),
('ascotonscotch',      'A Scot on Scotch',                   'https://ascotonscotch.com',             'https://ascotonscotch.com/feed/',                          'scotland', 'en', 'blog',     NULL),
('irishwhiskeymag',    'Irish Whiskey Magazine',             'https://www.irishwhiskeymagazine.com',  'https://www.irishwhiskeymagazine.com/feed/',               'ireland',  'en', 'news',     NULL),
('whiskymagjp',        'Whisky Magazine Japan',              'https://whiskymag.jp',                  'https://whiskymag.jp/feed/',                               'japan',    'ja', 'news',     NULL),
('whiskeywash',        'The Whiskey Wash',                   'https://thewhiskeywash.com',            'https://thewhiskeywash.com/feed/',                         'usa',      'en', 'news',     NULL),
('bourbonbanter',      'Bourbon & Banter',                   'https://www.bourbonbanter.com',         'https://www.bourbonbanter.com/rss/',                       'usa',      'en', 'blog',     NULL),
('whiskeyreviewer',    'The Whiskey Reviewer',               'https://whiskeyreviewer.com',           'https://whiskeyreviewer.com/feed/',                        'usa',      'en', 'blog',     NULL),
('whiskeyshelf',       'The Whiskey Shelf',                  'https://www.thewhiskeyshelf.com',       'https://www.thewhiskeyshelf.com/feed/',                    'usa',      'en', 'blog',     NULL),
('whiskeybon',         'Whiskeybon',                         'https://whiskeybon.com',                'https://whiskeybon.com/feed/',                             'usa',      'en', 'blog',     NULL),
('vinepair',           'VinePair (Whiskey)',                 'https://vinepair.com',                  'https://vinepair.com/tag/whiskey/feed/',                   'usa',      'en', 'news',     NULL),
('discus',             'Distilled Spirits Council (DISCUS)', 'https://distilledspirits.org',          'https://distilledspirits.org/feed/',                       'usa',      'en', 'official', NULL),
('dailypour',          'The Daily Pour',                     'https://thedailypour.com',              'https://thedailypour.com/feed/',                           'usa',      'en', 'news',     'whisky,whiskey,bourbon,scotch,rye,malt,distill,cask'),
('bevnet',             'BevNET (Spirits)',                   'https://www.bevnet.com',                'https://www.bevnet.com/news/spirits/feed/',                'usa',      'en', 'news',     'whisky,whiskey,bourbon,scotch,rye,malt,distill,cask'),
('justdrinks',         'Just Drinks (Spirits)',              'https://www.just-drinks.com',           'https://www.just-drinks.com/sector/spirits/feed/',         'other',    'en', 'news',     'whisky,whiskey,bourbon,scotch,rye,malt,distill,cask,diageo,pernod,suntory,edrington,william grant,brown-forman'),
('drinksint',          'Drinks International',               'https://drinksint.com',                 'https://drinksint.com/feed/',                              'other',    'en', 'news',     'whisky,whiskey,bourbon,scotch,rye,malt,distill,cask,diageo,pernod,suntory,edrington,william grant,brown-forman'),
('drinksretailing',    'Drinks Retailing News',              'https://drinksretailingnews.co.uk',     'https://drinksretailingnews.co.uk/feed/',                  'other',    'en', 'news',     'whisky,whiskey,bourbon,scotch,malt,distill,cask'),
('bonhams',            'Bonhams (Press Releases)',           'https://www.bonhams.com',               'https://www.bonhams.com/press_release/rss/',               'other',    'en', 'auction',  'whisky,whiskey,bourbon,scotch,malt,macallan,yamazaki,karuizawa,spirits');
