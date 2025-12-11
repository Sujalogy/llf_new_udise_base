const pool = require("../config/db");

// --- A. MASTER LIST (For Admin Sync Page) ---
// Returns ALL states/districts available in the master tables
exports.getAllStates = async () => {
  const result = await pool.query("SELECT DISTINCT stname, stcode11 FROM udise_data.state ORDER BY stname");
  return result.rows;
};

exports.getDistrictsByState = async (stcode11) => {
  const result = await pool.query(
    "SELECT dtname, dtcode11 FROM udise_data.district WHERE stcode11 = $1 ORDER BY dtname",
    [stcode11]
  );
  return result.rows;
};

// --- B. SYNCED LIST (For Explorer Page) ---
// Returns ONLY states/districts that have data in your `school_info` table
exports.getSyncedStates = async () => {
  const result = await pool.query(`
    SELECT DISTINCT stname, stcode11 
    FROM udise_data.school_info 
    ORDER BY stname
  `);
  return result.rows;
};

exports.getSyncedDistricts = async (stcode11) => {
  const result = await pool.query(`
    SELECT DISTINCT dtname, dtcode11 
    FROM udise_data.school_info 
    WHERE stcode11 = $1 
    ORDER BY dtname
  `, [stcode11]);
  return result.rows;
};