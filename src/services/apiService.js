const axios = require("axios");
const config = require("../config/constants");
const schoolModel = require("../models/schoolModel");

// ------------------------------------------------------------------
// STEP 1 SERVICE: Sync Directory from GIS (Using Object IDs)
// ------------------------------------------------------------------
exports.syncSchoolsFromGIS = async (stcode11, dtcode11, objectIds) => {
  const url = config.gis.url;
  const chunkSize = 50; // GIS API limit usually
  const chunks = [];

  for (let i = 0; i < objectIds.length; i += chunkSize) {
    chunks.push(objectIds.slice(i, i + chunkSize));
  }

  console.log(`📦 Syncing ${chunks.length} chunks from GIS...`);
  let totalInserted = 0;

  for (const chunk of chunks) {
    const params = {
      f: "json",
      // Fetch these fields as per your flow
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
          // Store in school_udise_list
          await schoolModel.upsertDirectorySchool(f.attributes);
          totalInserted++;
        } catch (err) {
          console.error("⚠️ Insert Error:", err.message);
        }
      }
    } catch (err) {
      console.error(`❌ GIS Chunk failed: ${err.message}`);
    }
  }
  return totalInserted;
};

// ------------------------------------------------------------------
// STEP 2 HELPERS: Proxy & Detail Fetching
// ------------------------------------------------------------------

// Proxy to UDISE+
exports.fetchUdisePlusData = async (endpoint, params) => {
  try {
    const url = `${config.udisePlus.baseUrl}/${endpoint}`;
    const response = await axios.get(url, { params, headers: config.udisePlus.headers });
    return response.data;
  } catch (error) {
    console.error(`Proxy Error [${endpoint}]:`, error.message);
    return { status: false, message: "API Error" };
  }
};

// Find School ID using UDISE Code (Required for details)
async function getSchoolIdByUdise(udiseCode) {
  try {
    const response = await exports.fetchUdisePlusData("search-schools", {
      searchType: 3, 
      searchParam: udiseCode
    });
    const schools = response?.data?.content || [];
    const matched = schools.find(s => s.udiseschCode === udiseCode) || schools[0];
    return matched ? matched.schoolId : null;
  } catch (error) {
    return null;
  }
}

// Fetch ALL Details for a UDISE Code
exports.fetchFullSchoolData = async (udiseCode, yearId = 11) => {
  // 1. Get ID
  const schoolId = await getSchoolIdByUdise(udiseCode);
  if (!schoolId) {
    console.warn(`Skipping ${udiseCode}: School ID not found in UDISE+.`);
    return null;
  }

  // 2. Fetch all details
  const endpoints = [
    { key: 'profile', url: 'school/profile', params: { schoolId, yearId } },
    { key: 'facility', url: 'school/facility', params: { schoolId, yearId } },
    { key: 'report', url: 'school/report-card', params: { schoolId, yearId } },
    { key: 'stats', url: 'school-statistics/enrolment-teacher', params: { schoolId } },
    { key: 'social_1', url: 'getSocialData', params: { schoolId, yearId, flag: 1 } },
    { key: 'social_2', url: 'getSocialData', params: { schoolId, yearId, flag: 2 } },
    { key: 'social_4', url: 'getSocialData', params: { schoolId, yearId, flag: 4 } },
    { key: 'social_5', url: 'getSocialData', params: { schoolId, yearId, flag: 5 } },
    { key: 'social_7', url: 'getSocialData', params: { schoolId, yearId, flag: 7 } }
  ];

  const results = {};

  await Promise.all(endpoints.map(async (ep) => {
    try {
      const data = await exports.fetchUdisePlusData(ep.url, ep.params);
      if (ep.key.startsWith('social_')) {
        results[ep.key] = data?.data?.schEnrollmentYearDataDTOS || [];
      } else {
        results[ep.key] = data?.data || null;
      }
    } catch (e) {
      results[ep.key] = null;
    }
  }));

  return {
    schoolId,
    udiseCode,
    yearId,
    profile: results.profile,
    facility: results.facility,
    report: results.report,
    stats: results.stats,
    social: {
      flag1: results.social_1,
      flag2: results.social_2,
      flag4: results.social_4,
      flag5: results.social_5,
      flag3: results.social_3
    }
  };
};

// Year fetcher
exports.fetchYears = async () => {
  try {
    const url = "https://kys.udiseplus.gov.in/webapp/api/master/year?year=1";
    const response = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    return response.data.data || [];
  } catch (error) { return []; }
};