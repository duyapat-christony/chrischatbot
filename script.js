const typingForm = document.querySelector(".typing-form");
const chatContainer = document.querySelector(".chat-list");
const typingInput = typingForm?.querySelector(".typing-input");
const suggestions = document.querySelectorAll(".suggestion");
const toggleThemeButton = document.querySelector("#theme-toggle-button");
const deleteChatButton = document.querySelector("#delete-chat-button");

const NETLIFY_FUNCTION_URL = "/.netlify/functions/gemini";

let userMessage = "";
let isResponseGenerating = false;

// Convert common Markdown and LaTeX into readable plain text.
const cleanChatbotResponse = (responseText) => {
  if (typeof responseText !== "string") return "";

  return (
    responseText
      // Convert common LaTeX fractions before removing braces.
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1) / ($2)")

      // Convert square roots and common mathematical commands.
      .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
      .replace(/\\pi\b/g, "π")
      .replace(/\\times\b/g, "×")
      .replace(/\\cdot\b/g, "·")
      .replace(/\\div\b/g, "÷")
      .replace(/\\pm\b/g, "±")
      .replace(/\\leq\b/g, "≤")
      .replace(/\\geq\b/g, "≥")
      .replace(/\\neq\b/g, "≠")
      .replace(/\\approx\b/g, "≈")
      .replace(/\\infty\b/g, "∞")
      .replace(/\\degree\b/g, "°")

      // Convert frequently used exponents to Unicode superscripts.
      .replace(/\^\{?2\}?/g, "²")
      .replace(/\^\{?3\}?/g, "³")

      // Remove LaTeX display and inline delimiters.
      .replace(/\\\[/g, "")
      .replace(/\\\]/g, "")
      .replace(/\\\(/g, "")
      .replace(/\\\)/g, "")
      .replace(/\$\$/g, "")
      .replace(/\$/g, "")

      // Remove Markdown headings, bold, and italic markers.
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/gs, "$1")
      .replace(/__(.*?)__/gs, "$1")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")

      // Convert Markdown list markers into readable bullets.
      .replace(/^\s*[-*]\s+/gm, "• ")

      // Remove backticks used for inline code.
      .replace(/```[a-zA-Z]*\n?/g, "")
      .replace(/```/g, "")
      .replace(/`([^`]+)`/g, "$1")

      // Remove common escaped braces and unnecessary trailing spaces.
      .replace(/\\([{}])/g, "$1")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
};

const scrollToBottom = () => {
  if (!chatContainer) return;
  chatContainer.scrollTo(0, chatContainer.scrollHeight);
};

const saveChats = () => {
  if (!chatContainer) return;
  localStorage.setItem("saved-chats", chatContainer.innerHTML);
};

// Load theme and saved chats.
const loadDataFromLocalstorage = () => {
  const savedChats = localStorage.getItem("saved-chats");
  const savedTheme = localStorage.getItem("themeColor") || "light_mode";

  document.body.classList.remove("light_mode", "dark_mode");
  document.body.classList.add(savedTheme);

  if (toggleThemeButton) {
    toggleThemeButton.innerText =
      savedTheme === "dark_mode" ? "light_mode" : "dark_mode";
  }

  if (typeof displayRandomQuestions === "function") {
    displayRandomQuestions();
  }

  if (chatContainer) {
    chatContainer.innerHTML = savedChats || "";
    document.body.classList.toggle("hide-header", Boolean(savedChats));
    scrollToBottom();
  }
};

const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

// Request an answer from the Netlify function.
const generateAPIResponse = async (incomingMessageDiv) => {
  const textElement = incomingMessageDiv.querySelector(".text");

  try {
    const response = await fetch(NETLIFY_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: userMessage }),
    });

    const responseText = await response.text();
    let data;

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      throw new Error(
        `The server returned an invalid response. HTTP ${response.status}.`,
      );
    }

    if (!response.ok) {
      throw new Error(
        data.error || `The chatbot request failed. HTTP ${response.status}.`,
      );
    }

    if (!data.reply) {
      throw new Error("The chatbot returned an empty response.");
    }

    textElement.textContent = cleanChatbotResponse(data.reply);
    saveChats();
    scrollToBottom();
  } catch (error) {
    console.error("Chatbot error:", error);
    textElement.textContent =
      error.message || "Unable to connect to the chatbot.";
    incomingMessageDiv.classList.add("error");
  } finally {
    isResponseGenerating = false;
    incomingMessageDiv.classList.remove("loading");
    scrollToBottom();
  }
};

const showLoadingAnimation = () => {
  const html = `<div class="message-content">
                  <img class="avatar" src="images/gemini.svg" alt="Chatbot avatar">
                  <p class="text"></p>
                  <div class="loading-indicator">
                    <div class="loading-bar"></div>
                    <div class="loading-bar"></div>
                    <div class="loading-bar"></div>
                  </div>
                </div>
                <span onclick="copyMessage(this)" class="icon material-symbols-rounded" style="float: right;">content_copy</span>`;

  const incomingMessageDiv = createMessageElement(html, "incoming", "loading");

  chatContainer.appendChild(incomingMessageDiv);
  scrollToBottom();
  generateAPIResponse(incomingMessageDiv);
};

// This function is global because the copy button uses onclick in the HTML string.
window.copyMessage = async (copyButton) => {
  const messageText =
    copyButton.parentElement.querySelector(".text")?.innerText || "";

  if (!messageText) return;

  try {
    await navigator.clipboard.writeText(messageText);
    copyButton.innerText = "done";
    setTimeout(() => {
      copyButton.innerText = "content_copy";
    }, 1000);
  } catch (error) {
    console.error("Clipboard error:", error);
  }
};

if (typingInput) {
  typingInput.addEventListener("input", () => {
    typingInput.style.height = "auto";
    typingInput.style.height = `${typingInput.scrollHeight}px`;
  });

  typingInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleOutgoingChat();
    }
  });
}

const handleOutgoingChat = (providedMessage = "") => {
  if (!typingForm || !typingInput || !chatContainer) {
    console.error("Required chatbot HTML elements were not found.");
    return;
  }

  userMessage = providedMessage.trim() || typingInput.value.trim();

  if (!userMessage || isResponseGenerating) return;

  isResponseGenerating = true;

  const html = `<div class="message-content">
                  <img class="avatar" src="images/user.jpg" alt="User avatar">
                  <p class="text"></p>
                </div>`;

  const outgoingMessageDiv = createMessageElement(html, "outgoing");
  outgoingMessageDiv.querySelector(".text").textContent = userMessage;
  chatContainer.appendChild(outgoingMessageDiv);

  typingForm.reset();
  typingInput.style.height = "auto";
  document.body.classList.add("hide-header");

  saveChats();
  scrollToBottom();
  setTimeout(showLoadingAnimation, 300);
};

if (toggleThemeButton) {
  toggleThemeButton.addEventListener("click", () => {
    const isDarkMode = document.body.classList.contains("dark_mode");
    const newTheme = isDarkMode ? "light_mode" : "dark_mode";

    document.body.classList.remove("light_mode", "dark_mode");
    document.body.classList.add(newTheme);
    localStorage.setItem("themeColor", newTheme);

    toggleThemeButton.innerText =
      newTheme === "dark_mode" ? "light_mode" : "dark_mode";
  });
}

if (deleteChatButton) {
  deleteChatButton.addEventListener("click", () => {
    const deleteChats = () => {
      localStorage.removeItem("saved-chats");
      window.location.reload();
    };

    if (typeof Swal !== "undefined") {
      Swal.fire({
        title: "Delete chats?",
        text: "Are you sure you want to delete all chats?",
        icon: "warning",
        reverseButtons: true,
        showCancelButton: true,
        confirmButtonText: "Delete",
        cancelButtonText: "Cancel",
      }).then((result) => {
        if (!result.isConfirmed) return;

        localStorage.removeItem("saved-chats");

        Swal.fire(
          "Deleted!",
          "All your chats have been deleted.",
          "success",
        ).then(() => {
          window.location.reload();
        });
      });
    } else if (window.confirm("Are you sure you want to delete all chats?")) {
      deleteChats();
    }
  });
}

suggestions.forEach((suggestion) => {
  suggestion.addEventListener("click", () => {
    const suggestionText =
      suggestion.querySelector(".text")?.innerText.trim() || "";

    if (suggestionText) {
      handleOutgoingChat(suggestionText);
    }
  });
});

if (typingForm) {
  typingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleOutgoingChat();
  });
}

loadDataFromLocalstorage();
