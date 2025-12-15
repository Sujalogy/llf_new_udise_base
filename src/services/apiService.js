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

  let totalInserted = 0;

  for (const chunk of chunks) {
    const params = {
      f: "json",
      // Fetch these fields as per your flow
      outFields:
        "objectid,latitude,longitude,pincode,schcd,stname,dtname,stcode11,dtcode11",
      objectIds: chunk.join(","),
      where: `stcode11='${stcode11}' AND dtcode11='${dtcode11}'`,
      returnGeometry: "false",
    };

    try {
      const response = await axios.get(url, {
        params,
        headers: config.gis.headers,
        timeout: 30000,
      });
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

    const response = await axios.get(url, {
      params,
      headers: config.udisePlus.headers,
    });
    return response.data;
  } catch (error) {
    return { status: false, message: "API Error" };
  }
};

// Find School ID using UDISE Code (Required for details)
async function getSchoolIdByUdise(udiseCode) {
  try {
    const response = await exports.fetchUdisePlusData("search-schools", {
      searchType: 3,
      searchParam: udiseCode,
    });
    const schools = response?.data?.content || [];
    const matched =
      schools.find((s) => s.udiseschCode === udiseCode) || schools[0];
    return matched ? matched.schoolId : null;
  } catch (error) {
    return null;
  }
}

// Fetch ALL Details for a UDISE Code
exports.fetchFullSchoolData = async (udiseCode, yearId = 11) => {
  const schoolId = await getSchoolIdByUdise(udiseCode);
  if (!schoolId) {
    console.warn(`Skipping ${udiseCode}: School ID not found in UDISE+.`);
    return null;
  }

  // [FIX]: Added social_3 (Flag 3) for Age Data
  const endpoints = [
    { key: "profile", url: "school/profile", params: { schoolId, yearId } },
    { key: "facility", url: "school/facility", params: { schoolId, yearId } },
    { key: "report", url: "school/report-card", params: { schoolId, yearId } },
    {
      key: "stats",
      url: "school-statistics/enrolment-teacher",
      params: { schoolId },
    },
    {
      key: "social_1",
      url: "getSocialData",
      params: { schoolId, yearId, flag: 1 },
    },
    {
      key: "social_2",
      url: "getSocialData",
      params: { schoolId, yearId, flag: 2 },
    }, // CWSN
    {
      key: "social_3",
      url: "getSocialData",
      params: { schoolId, yearId, flag: 3 },
    }, // Age Data
    {
      key: "social_4",
      url: "getSocialData",
      params: { schoolId, yearId, flag: 4 },
    }, // EWS
    {
      key: "social_5",
      url: "getSocialData",
      params: { schoolId, yearId, flag: 5 },
    }, // RTE
  ];

  const results = {};

  await Promise.all(
    endpoints.map(async (ep) => {
      try {
        const data = await exports.fetchUdisePlusData(ep.url, ep.params);
        if (ep.key.startsWith("social_")) {
          results[ep.key] = data?.data?.schEnrollmentYearDataDTOS || [];
        } else {
          results[ep.key] = data?.data || null;
        }
      } catch (e) {
        results[ep.key] = null;
      }
    })
  );

  // [FIX]: Manually label Flag 3 (Age Data) starting from Age 3 to 20
  if (results.social_3 && results.social_3.length > 0) {
    results.social_3 = results.social_3.map((item, index) => ({
      ...item,
      // If enrollmentName is empty, assign "Age X" starting from 3
      enrollmentName: item.enrollmentName || `Age ${index + 3}`,
    }));
  }

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
      flag2: results.social_2, // CWSN Data
      flag3: results.social_3, // Age Data (Now Labeled)
      flag4: results.social_4, // EWS
      flag5: results.social_5, // RTE
    },
  };
};

// Year fetcher
exports.fetchYears = async () => {
  try {
    const url = "https://kys.udiseplus.gov.in/webapp/api/master/year?year=1";
    const response = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return response.data.data || [];
  } catch (error) {
    return [];
  }
};
