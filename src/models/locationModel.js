const pool = require("../config/db");

// --- A. MASTER LIST (For Admin Sync Page) ---
// Returns ALL states/districts available in the master tables
exports.getAllStates = async () => {
  const result = await pool.query(
    "SELECT DISTINCT stname, stcode11 FROM udise_data.state ORDER BY stname"
  );
  return result.rows;
};

exports.getDistrictsByState = async (stcode11) => {
  // [EXISTING]: Counts schools from master_object
  const query = `
    SELECT d.dtname, d.dtcode11, COUNT(m.object_id)::int as school_count
    FROM udise_data.district d
    LEFT JOIN udise_data.master_object m 
      ON d.dtcode11 = m.dtcode11 AND d.stcode11 = m.stcode11
    WHERE d.stcode11 = $1
    GROUP BY d.dtname, d.dtcode11
    ORDER BY d.dtname
  `;
  const result = await pool.query(query, [stcode11]);
  return result.rows;
};
// --- B. SYNCED LIST (For Explorer Page) ---
// Returns ONLY states/districts that have data in your `udise_data.school_udise_list` table
exports.getSyncedStates = async () => {
  const result = await pool.query(`
    SELECT DISTINCT l.stname, l.stcode11 
    FROM udise_data.school_udise_list l
    JOIN udise_data.school_udise_data d ON l.schcd = d.udise_code
    ORDER BY l.stname
  `);
  return result.rows;
};

exports.getSyncedDistricts = async (stcode11) => {
  const result = await pool.query(
    `
    SELECT DISTINCT l.dtname, l.dtcode11 
    FROM udise_data.school_udise_list l
    JOIN udise_data.school_udise_data d ON l.schcd = d.udise_code
    WHERE l.stcode11 = $1 
    ORDER BY l.dtname
  `,
    [stcode11]
  );
  return result.rows;
};
