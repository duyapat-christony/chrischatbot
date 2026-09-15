exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: "Method Not Allowed. Use a POST request.",
      }),
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "The request body is missing." }),
      };
    }

    let requestBody;

    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "The request body must be valid JSON." }),
      };
    }

    const message =
      typeof requestBody.message === "string" ? requestBody.message.trim() : "";

    if (!message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Please enter a message." }),
      };
    }

    if (message.length > 10000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Your message is too long." }),
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing.");

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error:
            "The chatbot API key is not configured in Netlify Environment Variables.",
        }),
      };
    }

    const model = "gemini-3.5-flash-lite";
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const geminiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: [
                "You are a helpful mathematics educational chatbot for students.",
                "Give clear, accurate, concise, and age-appropriate explanations.",
                "Respond using plain text only.",
                "Do not use Markdown formatting.",
                "Do not use LaTeX or MathJax notation.",
                "Do not put dollar signs around mathematical expressions.",
                "Do not use backslashes in mathematical expressions.",
                "Do not use asterisks for bold text or bullet points.",
                "Use Unicode mathematical symbols whenever possible.",
                "Write pi as π, multiplication as ×, division as ÷, and square root as √.",
                "Write common exponents with Unicode superscripts, such as x², x³, and r².",
                "Write fractions in readable plain text, such as (a + b) / c.",
                "Use numbered steps for solutions and put each step on a separate line.",
                "For lists, use simple numbered items or the Unicode bullet •.",
                "Example: write V = πr²h, not LaTeX code.",
              ].join(" "),
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: message }],
          },
        ],
        generationConfig: {
          temperature: 0.5,
          topP: 0.9,
          maxOutputTokens: 2048,
        },
      }),
    });

    const responseText = await geminiResponse.text();
    let geminiData;

    try {
      geminiData = responseText ? JSON.parse(responseText) : {};
    } catch (error) {
      console.error("Gemini returned invalid JSON:", responseText);

      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Gemini returned an invalid response.",
        }),
      };
    }

    if (!geminiResponse.ok) {
      const googleError =
        geminiData?.error?.message ||
        `Gemini API request failed with status ${geminiResponse.status}.`;

      console.error("Gemini API error:", googleError);

      return {
        statusCode: geminiResponse.status,
        headers,
        body: JSON.stringify({ error: googleError }),
      };
    }

    const reply =
      geminiData?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim() || "";

    if (!reply) {
      const reason =
        geminiData?.promptFeedback?.blockReason ||
        geminiData?.candidates?.[0]?.finishReason ||
        "No response was generated.";

      console.error("Gemini generated no text:", geminiData);

      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: `The chatbot could not generate an answer. Reason: ${reason}`,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply }),
    };
  } catch (error) {
    console.error("Netlify Gemini function error:", error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "An unexpected server error occurred.",
      }),
    };
  }
};
