const axios = require("axios");
const config = require("../config/constants");
const schoolModel = require("../models/schoolModel");

// --- SYNC SERVICE (Geoportal) ---
exports.syncSchoolsFromGIS = async (stcode11, dtcode11, objectIds) => {
  const url = config.gis.url;
  const chunkSize = 100;
  const chunks = [];

  for (let i = 0; i < objectIds.length; i += chunkSize) {
    chunks.push(objectIds.slice(i, i + chunkSize));
  }

  console.log(`📦 Syncing ${chunks.length} chunks...`);
  let totalInserted = 0;

  for (const chunk of chunks) {
    const params = {
      f: "json",
      outFields: "objectid,latitude,longitude,pincode,schcd,stname,dtname,stcode11,dtcode11",
      objectIds: chunk.join(","),
      where: `stcode11='${stcode11}' AND dtcode11='${dtcode11}'`,
      returnGeometry: "false",
    };

    try {
      const response = await axios.get(url, { params, headers: config.gis.headers, timeout: 30000 });
      const features = response.data.features || [];

      for (const f of features) {
        try {
          await schoolModel.upsertSchool(f.attributes);
          totalInserted++;
        } catch (err) {
          console.error("⚠️ Insert Error:", err.message);
        }
      }
    } catch (err) {
      console.error(`❌ Chunk failed: ${err.message}`);
    }
  }
  return totalInserted;
};

// --- PROXY SERVICE (UDISE+) ---
exports.fetchUdisePlusData = async (endpoint, params) => {
  try {
    const url = `${config.udisePlus.baseUrl}/${endpoint}`;
    // Pass params directly to the external API
    const response = await axios.get(url, { 
      params, 
      headers: config.udisePlus.headers 
    });
    return response.data;
  } catch (error) {
    console.error(`Proxy Error [${endpoint}]:`, error.message);
    // Return a safe error structure so frontend doesn't crash
    return { status: false, message: "Failed to fetch data from UDISE+", error: error.message };
  }
};