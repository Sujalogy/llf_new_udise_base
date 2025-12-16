const pool = require("../config/db");

exports.getAllStates = async () => {
  const result = await pool.query(
    "SELECT DISTINCT stname, stcode11 FROM udise_data.state ORDER BY stname"
  );
  return result.rows;
};

exports.getDistrictsByState = async (stcode11) => {
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

exports.getSyncedStates = async (yearDesc) => {
  let query = `
    SELECT DISTINCT l.stname, l.stcode11 
    FROM udise_data.school_udise_list l
    JOIN udise_data.school_udise_data d ON l.schcd = d.udise_code
  `;
  const params = [];

  if (yearDesc) {
    query += ` WHERE d.year_desc = $1`;
    params.push(yearDesc);
  }

  query += ` ORDER BY l.stname`;

  const result = await pool.query(query, params);
  return result.rows;
};

exports.getSyncedDistricts = async (stcode11, yearDesc) => {
  let query = `
    SELECT DISTINCT l.dtname, l.dtcode11 
    FROM udise_data.school_udise_list l
    JOIN udise_data.school_udise_data d ON l.schcd = d.udise_code
    WHERE l.stcode11 = $1
  `;
  const params = [stcode11];
  
  if (yearDesc) {
    query += ` AND d.year_desc = $2`;
    params.push(yearDesc);
  }
  
  query += ` ORDER BY l.dtname`;

  const result = await pool.query(query, params);
  return result.rows;
};
