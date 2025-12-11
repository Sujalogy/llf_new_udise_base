module.exports = {
  // 1. GIS Portal (For syncing UDISE Codes/Lat/Long)
  gis: {
    url: "https://geoportal.nic.in/nicgis/rest/services/SCHOOLGIS/Schooldata/MapServer/0/query",
    headers: {
      Accept: "*/*",
      Origin: "https://schoolgis.nic.in",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    },
  },
  // 2. UDISE+ Portal (For detailed reports)
  udisePlus: {
    baseUrl: "https://kys.udiseplus.gov.in/webapp/api",
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  },
};