const pool = require("../config/db");

// 1. Get Object IDs (Used by Admin Sync)
exports.getObjectIds = async (stcode11, dtcode11) => {
  const result = await pool.query(
    "SELECT object_id FROM udise_data.master_object WHERE stcode11=$1 AND dtcode11=$2",
    [stcode11, dtcode11]
  );
  return result.rows.map((r) => r.object_id);
};

// 2. Insert/Update School (Used by Admin Sync)
exports.upsertSchool = async (data) => {
  await pool.query(
    `INSERT INTO udise_data.school_info
    (objectid, latitude, longitude, pincode, schcd, stname, dtname, stcode11, dtcode11)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (schcd) DO UPDATE SET 
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      pincode = EXCLUDED.pincode`,
    [
      data.objectid, data.latitude, data.longitude, data.pincode, 
      data.schcd, data.stname, data.dtname, data.stcode11, data.dtcode11
    ]
  );
};

// 3. Get Local School List (Used by Explorer & Export)
exports.getLocalSchoolList = async (stcode11, dtcode11) => {
  // Add pagination logic if needed, currently fetching all for simplicity/export
  const query = `
    SELECT 
      schcd as udise_code, 
      stname as state_name, 
      dtname as district_name, 
      pincode,
      latitude,
      longitude
    FROM udise_data.school_info 
    WHERE stcode11 = $1 AND dtcode11 = $2
    ORDER BY schcd ASC
  `;
  const result = await pool.query(query, [stcode11, dtcode11]);
  return result.rows;
};