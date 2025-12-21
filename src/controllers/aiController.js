// src/controllers/aiController.js
const pool = require("../config/db");
const { GoogleGenAI } = require("@google/genai"); // New SDK

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Initialize the new SDK
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const SCHEMA_CONTEXT = `
Tables:
1. udise_data.school_udise_data: Columns: udise_code, school_name, state_name, district_name, total_students, total_teachers, has_electricity, etc.
2. udise_data.school_udise_list: Columns: schcd, pincode, latitude, longitude.

Instructions:
- If greeting (hi, hello), return: {"sql": null, "isGreeting": true, "format": "text"}
- Otherwise, return ONLY a JSON object: {"sql": "SELECT...", "explanation": "...", "format": "text|table|chart"}
- Limit results to 50.
`;

exports.askAssistant = async (req, res) => {
  try {
    const { prompt } = req.body;

    // Use gemini-1.5-flash for higher availability on free tiers
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [{ role: "user", parts: [{ text: SCHEMA_CONTEXT + "\nUser Question: " + prompt }] }]
    });

    const responseText = response.text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.json({ answer: responseText, data: [], format: "text" });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.isGreeting || !parsed.sql) {
      return res.json({
        answer: "Hello! I am your UDISE data assistant. How can I help you explore school metrics today?",
        data: [],
        format: "text"
      });
    }

    // Execute SQL
    const dbResult = await pool.query(parsed.sql);

    // Summarize Data
    const summary = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [{ 
        role: "user", 
        parts: [{ text: `Summarize this data for the user query "${prompt}": ${JSON.stringify(dbResult.rows.slice(0, 5))}` }] 
      }]
    });

    res.json({
      answer: summary.text,
      data: dbResult.rows,
      format: parsed.format || "table",
      query: parsed.sql 
    });

  } catch (err) {
    console.error("AI Error:", err);
    // Handle 429 specifically in response
    if (err.status === 429) {
      return res.status(429).json({ error: "Daily limit reached. Please try again in a few minutes." });
    }
    res.status(500).json({ error: "Service currently unavailable." });
  }
};