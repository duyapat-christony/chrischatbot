exports.handler = async function (event) {
  const jsonHeaders = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  // Only accept POST requests.
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({
        error: "Method Not Allowed. Use a POST request.",
      }),
    };
  }

  try {
    // Check that the request contains a body.
    if (!event.body) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({
          error: "The request body is missing.",
        }),
      };
    }

    // Parse the request body.
    let requestBody;

    try {
      requestBody = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({
          error: "The request body must be valid JSON.",
        }),
      };
    }

    const message =
      typeof requestBody.message === "string" ? requestBody.message.trim() : "";

    // Validate the user's message.
    if (!message) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({
          error: "Please enter a message.",
        }),
      };
    }

    // Prevent very large requests.
    if (message.length > 10000) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({
          error: "Your message is too long.",
        }),
      };
    }

    // Get the Gemini API key from Netlify Environment Variables.
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing.");

      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({
          error:
            "The chatbot API key is not configured. Add GEMINI_API_KEY in Netlify Environment Variables.",
        }),
      };
    }

    // Gemini 2.5 Flash-Lite endpoint.
    const model = "gemini-3.5-flash-lite";

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    // Send the message to Gemini.
    const geminiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: `
        You are a helpful mathematics educational chatbot.

        Follow these response-formatting rules:
        1. Respond using plain text only.
        2. Do not use Markdown formatting.
        3. Do not use LaTeX or MathJax notation.
        4. Do not use dollar signs around mathematical expressions.
        5. Do not use backslashes in mathematical expressions.
        6. Do not use asterisks for bold text or bullet points.
        7. Use Unicode mathematical symbols whenever possible.
        8. Write exponents using Unicode superscripts, such as x², x³, and r².
        9. Write fractions in an easy-to-read plain-text form, such as (a + b) / c.
        10. Use numbered steps for mathematical solutions.
        11. Put each step on a separate line.
        12. Provide clear, accurate, age-appropriate explanations.

        Examples:
        Write: V = πr²h
        Do not write: $V = \\pi r^2 h$

        Write: x = (-b ± √(b² - 4ac)) / 2a
        Do not write LaTeX commands.

        Write: 1. Identify the radius.
        Do not write: * Identify the radius.
              `.trim(),
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: message,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 2048,
        },
      }),
    });

    // Safely read Google's response.
    const responseText = await geminiResponse.text();

    let geminiData;

    try {
      geminiData = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error("Invalid response from Gemini:", responseText);

      return {
        statusCode: 502,
        headers: jsonHeaders,
        body: JSON.stringify({
          error: "Gemini returned an invalid response.",
        }),
      };
    }

    // Handle an error returned by the Gemini API.
    if (!geminiResponse.ok) {
      const googleError =
        geminiData?.error?.message ||
        `Gemini API request failed with status ${geminiResponse.status}.`;

      console.error("Gemini API error:", {
        status: geminiResponse.status,
        error: googleError,
      });

      return {
        statusCode: geminiResponse.status,
        headers: jsonHeaders,
        body: JSON.stringify({
          error: googleError,
        }),
      };
    }

    // Combine all text parts returned by Gemini.
    const reply =
      geminiData?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim() || "";

    if (!reply) {
      const blockReason =
        geminiData?.promptFeedback?.blockReason ||
        geminiData?.candidates?.[0]?.finishReason ||
        "No response was generated.";

      console.error("Gemini generated no text:", geminiData);

      return {
        statusCode: 502,
        headers: jsonHeaders,
        body: JSON.stringify({
          error: `The chatbot could not generate an answer. Reason: ${blockReason}`,
        }),
      };
    }

    // Return a simplified response to the browser.
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        reply: reply,
      }),
    };
  } catch (error) {
    console.error("Netlify Gemini function error:", error);

    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "An unexpected server error occurred.",
      }),
    };
  }
};
