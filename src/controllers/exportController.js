const schoolModel = require("../models/schoolModel");

// CSV Converter
const jsonToCsv = (data) => {
  if (!data || !data.length) return "";
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(",")];
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      const escaped = ('' + (val || '')).replace(/"/g, '\\"');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(","));
  }
  return csvRows.join("\n");
};

exports.downloadSchoolList = async (req, res) => {
  try {
    const { stcode11, dtcode11, format } = req.query;
    if (!stcode11 || !dtcode11) return res.status(400).json({ error: "Required params missing" });

    const schools = await schoolModel.getLocalSchoolList(stcode11, dtcode11);

    if (format === "csv") {
      const csvData = jsonToCsv(schools);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=schools_${stcode11}_${dtcode11}.csv`);
      return res.send(csvData);
    } else {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=schools_${stcode11}_${dtcode11}.json`);
      return res.send(JSON.stringify(schools, null, 2));
    }
  } catch (err) {
    res.status(500).json({ error: "Export failed" });
  }
};