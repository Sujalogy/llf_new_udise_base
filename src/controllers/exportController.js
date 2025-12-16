const schoolModel = require("../models/schoolModel");
const apiService = require("../services/apiService");

// Mapping for Social Data Keys (from your columns.json)
const SOCIAL_KEY_MAP = {
  pp1B: "pre_primary_boy_1", pp1G: "pre_primary_girl_1",
  pp2B: "pre_primary_boy_2", pp2G: "pre_primary_girl_2",
  pp3B: "pre_primary_boy_3", pp3G: "pre_primary_girl_3",
  c1B: "class_1_boy", c1G: "class_1_girl",
  c2B: "class_2_boy", c2G: "class_2_girl",
  c3B: "class_3_boy", c3G: "class_3_girl",
  c4B: "class_4_boy", c4G: "class_4_girl",
  c5B: "class_5_boy", c5G: "class_5_girl",
  c6B: "class_6_boy", c6G: "class_6_girl",
  c7B: "class_7_boy", c7G: "class_7_girl",
  c8B: "class_8_boy", c8G: "class_8_girl",
  rowBoyTotal: "total_boys", rowGirlTotal: "total_girls"
};

// Helper to flatten JSONB arrays
const flattenSocialData = (row) => {
  const flatRow = { ...row };
  
  // Fields to parse and flatten
  const socialFields = [
    'social_data_general_sc_st_obc', 
    'social_data_religion', 
    'social_data_cwsn', 
    'social_data_rte', 
    'social_data_ews'
  ];

  socialFields.forEach(field => {
    if (flatRow[field] && Array.isArray(flatRow[field])) {
      flatRow[field].forEach(item => {
        // Use enrollmentName (e.g., "General", "SC", "Muslim") as prefix
        const prefix = (item.enrollmentName || "Unknown").replace(/\s+/g, '_');
        
        // Map specific keys
        Object.keys(item).forEach(key => {
          if (SOCIAL_KEY_MAP[key]) {
            const newKey = `${prefix}_${SOCIAL_KEY_MAP[key]}`;
            flatRow[newKey] = item[key];
          }
        });
      });
    }
    // Remove the original huge JSON object from export
    delete flatRow[field];
  });

  return flatRow;
};

// JSON to CSV Converter
const jsonToCsv = (data) => {
  if (!data || !data.length) return "";
  
  // Process first row to get headers (including dynamic flattened keys)
  const headers = Object.keys(data[0]);
  
  const csvRows = [headers.join(",")];
  
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      // Handle nulls and escape quotes
      const escaped = (val === null || val === undefined) ? '' : ('' + val).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(","));
  }
  return csvRows.join("\n");
};

exports.downloadSchoolList = async (req, res) => {
  try {
    const { stcode11, dtcode11, yearId, category, management, format } = req.query;

    // Resolve Year
    let yearDesc = null;
    if (yearId) {
      const years = await apiService.fetchYears();
      const match = years.find((y) => String(y.yearId) === String(yearId));
      if (match) yearDesc = match.yearDesc;
    }

    const filters = { stcode11, dtcode11, yearDesc, category, management };

    // 1. Fetch Data dynamically
    const rawData = await schoolModel.getExportData(filters);

    if (!rawData.length) {
      return res.status(404).json({ error: "No data found matching your filters." });
    }

    // 2. Flatten Data
    const flatData = rawData.map(flattenSocialData);

    const filename = `schools_export_${yearDesc || 'all'}_${stcode11 || 'all'}`;

    // 3. Send Response
    if (format === "csv") {
      const csvData = jsonToCsv(flatData);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}.csv`);
      return res.send(csvData);
    } else {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}.json`);
      return res.send(JSON.stringify(flatData, null, 2));
    }
  } catch (err) {
    console.error("Export Error:", err);
    res.status(500).json({ error: "Export failed", details: err.message });
  }
};