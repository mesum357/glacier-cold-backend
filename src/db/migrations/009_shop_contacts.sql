ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS contacts TEXT NOT NULL DEFAULT 'Rizwan Akbar: 0355-5454859
Tauqeer Ahmed: 0311-1028883';

UPDATE shop_settings
SET
  store_name = 'GLACIER COLD STORAGE',
  address = 'Shaheed Saif Ur Rehman Hospital River View Road Gilgit',
  contacts = 'Rizwan Akbar: 0355-5454859
Tauqeer Ahmed: 0311-1028883'
WHERE id = 1;
