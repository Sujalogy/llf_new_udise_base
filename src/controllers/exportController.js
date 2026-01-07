const schoolModel = require("../models/schoolModel");
const apiService = require("../services/apiService");
const pool = require("../config/db"); // [ADDED] Required for logging downloads

// Mapping for Social Data Keys (from your columns.json)
const SOCIAL_KEY_MAP = {
  pp1B: "pre_primary_boy_1",
  pp1G: "pre_primary_girl_1",
  pp2B: "pre_primary_boy_2",
  pp2G: "pre_primary_girl_2",
  pp3B: "pre_primary_boy_3",
  pp3G: "pre_primary_girl_3",
  c1B: "class_1_boy",
  c1G: "class_1_girl",
  c2B: "class_2_boy",
  c2G: "class_2_girl",
  c3B: "class_3_boy",
  c3G: "class_3_girl",
  c4B: "class_4_boy",
  c4G: "class_4_girl",
  c5B: "class_5_boy",
  c5G: "class_5_girl",
  c6B: "class_6_boy",
  c6G: "class_6_girl",
  c7B: "class_7_boy",
  c7G: "class_7_girl",
  c8B: "class_8_boy",
  c8G: "class_8_girl",
  rowBoyTotal: "total_boys",
  rowGirlTotal: "total_girls",
};

// Helper to flatten JSONB arrays
const flattenSocialData = (row) => {
  const flatRow = { ...row };

  // Fields to parse and flatten
  const socialFields = [
    "social_data_general_sc_st_obc",
    "social_data_religion",
    "social_data_cwsn",
    "social_data_rte",
    "social_data_ews",
  ];

  socialFields.forEach((field) => {
    if (flatRow[field] && Array.isArray(flatRow[field])) {
      flatRow[field].forEach((item) => {
        // Use enrollmentName (e.g., "General", "SC", "Muslim") as prefix
        const prefix = (item.enrollmentName || "Unknown").replace(/\s+/g, "_");

        // Map specific keys
        Object.keys(item).forEach((key) => {
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
    const values = headers.map((header) => {
      const val = row[header];
      // Handle nulls and escape quotes
      const escaped =
        val === null || val === undefined ? "" : ("" + val).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(","));
  }
  return csvRows.join("\n");
};

exports.downloadSchoolList = async (req, res) => {
  try {
    const { 
      stcode11, 
      dtcode11, 
      stateName, 
      districtName, 
      yearId, 
      category, 
      management, 
      schoolType,
      format 
    } = req.query;
    const userId = req.user.userId; //
    // 1. [RESTRICTION] Enforce District Level Download
    if (!dtcode11) {
      return res.status(402).json({
        error: "Download Restricted",
        message: "You can only download data at the district level. Please select a specific district to continue.",
      });
    }

    // Resolve Year Descriptor
    let yearDesc = null;
    if (yearId) {
      const years = await apiService.fetchYears();
      const match = years.find((y) => String(y.yearId) === String(yearId));
      if (match) yearDesc = match.yearDesc;
    }

    const filters = { stcode11, dtcode11, yearDesc, category, management, schoolType };

    // 2. Fetch Data dynamically
    const rawData = await schoolModel.getExportData(filters);

    if (!rawData.length) {
      return res.status(404).json({ error: "No data found matching your filters." });
    }

    // 3. Flatten Social Data
    const flatData = rawData.map(flattenSocialData);

    // 4. Prepare File Content
    let finalContent;
    let contentType;
    if (format === "csv") {
      finalContent = jsonToCsv(flatData); //
      contentType = "text/csv";
    } else {
      finalContent = JSON.stringify(flatData, null, 2);
      contentType = "application/json";
    }

    // 5. [MONITORING] Calculate byte size and log with user MB usage
    const bytesDownloaded = Buffer.byteLength(finalContent, 'utf8');
    await pool.query(
      "INSERT INTO udise_data.download_logs (user_id, format, filters, bytes_downloaded) VALUES ($1, $2, $3, $4)",
      [userId, format, JSON.stringify(filters), bytesDownloaded]
    );

    // 6. [NAMING] Construct filename: StateName_DistrictName_Date
    const date = new Date().toISOString().split('T')[0];
    const sName = (stateName || stcode11 || 'all').replace(/\s+/g, '_');
    const dName = (districtName || dtcode11 || 'all').replace(/\s+/g, '_');
    const filename = `${sName}_${dName}_${date}`;

    // 7. Send File
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename=${filename}.${format}`);
    return res.send(finalContent);

  } catch (err) {
    console.error("Export Error:", err);
    res.status(500).json({ error: "Export failed", details: err.message });
  }
};

exports.getExternalUdiseList = async (req, res) => {
  try {
    const { page = 1, limit = 50, titleHeader, yearId, search } = req.query;
    const userId = req.user.userId; // Get authenticated user
    
    let yearDesc = null;
    if (yearId) {
      const years = await apiService.fetchYears();
      const match = years.find(y => String(y.yearId) === String(yearId));
      if (match) yearDesc = match.yearDesc;
    }

    // Pass userId to filter accessible vaults only
    const result = await schoolModel.getExternalSchoolList(
      { titleHeader, yearDesc, search },
      parseInt(page),
      parseInt(limit),
      userId // NEW: Only show user's accessible data
    );
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getExternalBatchFilters = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Only show batches user has access to
    const query = `
      SELECT DISTINCT e.title_header, u.name as owner_name
      FROM udise_data.external_udise_data e
      JOIN udise_data.users u ON e.uploaded_by_user_id = u.user_id
      LEFT JOIN udise_data.external_vault_shares s 
        ON e.title_header = s.title_header 
        AND e.uploaded_by_user_id = s.owner_user_id
      WHERE e.uploaded_by_user_id = $1 
         OR s.shared_with_user_id = $1
      ORDER BY e.title_header
    `;
    
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch batches" });
  }
};

exports.getUserVaults = async (req, res) => {
  try {
    const userId = req.user.userId;
    const vaults = await schoolModel.getUserAccessibleVaults(userId);
    res.json(vaults);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.exportExternalDataFlattened = async (req, res) => {
  try {
    const { format = "csv", titleHeader } = req.query;
    const userId = req.user.userId;
    
    if (!titleHeader) {
      return res.status(400).json({ error: "Batch title (titleHeader) is required" });
    }

    // Verify user has access to this vault
    const accessCheck = `
      SELECT COUNT(*) as count 
      FROM udise_data.external_udise_data e
      LEFT JOIN udise_data.external_vault_shares s 
        ON e.title_header = s.title_header 
        AND e.uploaded_by_user_id = s.owner_user_id
      WHERE e.title_header = $1 
        AND (e.uploaded_by_user_id = $2 OR s.shared_with_user_id = $2)
    `;
    
    const accessResult = await pool.query(accessCheck, [titleHeader, userId]);
    
    if (parseInt(accessResult.rows[0].count) === 0) {
      return res.status(403).json({ error: "You don't have access to this vault" });
    }

    // Fetch and export data
    const rawData = await schoolModel.getExternalDataByBatch(titleHeader);
    if (!rawData.length) return res.status(404).send("No data found");

    const flatData = rawData.map(flattenSocialData);

    let finalContent;
    if (format === "csv") {
      finalContent = jsonToCsv(flatData);
      res.setHeader("Content-Type", "text/csv");
    } else {
      finalContent = JSON.stringify(flatData, null, 2);
      res.setHeader("Content-Type", "application/json");
    }

    const filename = `External_${titleHeader}_${new Date().toISOString().split('T')[0]}`;
    res.setHeader("Content-Disposition", `attachment; filename=${filename}.${format}`);
    return res.send(finalContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};