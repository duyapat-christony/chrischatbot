const typingForm = document.querySelector(".typing-form");
const chatContainer = document.querySelector(".chat-list");
const typingInput = typingForm?.querySelector(".typing-input");
const suggestions = document.querySelectorAll(".suggestion");
const toggleThemeButton = document.querySelector("#theme-toggle-button");
const deleteChatButton = document.querySelector("#delete-chat-button");

const NETLIFY_FUNCTION_URL = "/.netlify/functions/gemini";
const MAX_HISTORY_MESSAGES = 20;

let userMessage = "";
let isResponseGenerating = false;
let conversationHistory = [];

try {
  const savedHistory = JSON.parse(localStorage.getItem("chat-history") || "[]");

  conversationHistory = Array.isArray(savedHistory) ? savedHistory : [];
} catch (error) {
  console.error("Could not load chat history:", error);
  conversationHistory = [];
}

// Convert occasional Markdown and LaTeX into readable plain text.
const cleanChatbotResponse = (responseText) => {
  if (typeof responseText !== "string") return "";

  return responseText
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1) / ($2)")
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
    .replace(/\^\{?2\}?/g, "²")
    .replace(/\^\{?3\}?/g, "³")
    .replace(/\\\[/g, "")
    .replace(/\\\]/g, "")
    .replace(/\\\(/g, "")
    .replace(/\\\)/g, "")
    .replace(/\$\$/g, "")
    .replace(/\$/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/gs, "$1")
    .replace(/__(.*?)__/gs, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/```[a-zA-Z]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\\([{}])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const scrollToBottom = () => {
  if (!chatContainer) return;
  chatContainer.scrollTo(0, chatContainer.scrollHeight);
};

const saveVisibleChats = () => {
  if (!chatContainer) return;
  localStorage.setItem("saved-chats", chatContainer.innerHTML);
};

const saveConversationHistory = () => {
  localStorage.setItem("chat-history", JSON.stringify(conversationHistory));
};

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

const generateAPIResponse = async (incomingMessageDiv, currentMessage) => {
  const textElement = incomingMessageDiv.querySelector(".text");

  try {
    const response = await fetch(NETLIFY_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: currentMessage,
        history: conversationHistory,
      }),
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

    const cleanedResponse = cleanChatbotResponse(data.reply);
    textElement.textContent = cleanedResponse;

    conversationHistory.push({
      role: "user",
      text: currentMessage,
    });

    conversationHistory.push({
      role: "model",
      text: cleanedResponse,
    });

    if (conversationHistory.length > MAX_HISTORY_MESSAGES) {
      conversationHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
    }

    saveConversationHistory();
    saveVisibleChats();
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

const showLoadingAnimation = (currentMessage) => {
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
  generateAPIResponse(incomingMessageDiv, currentMessage);
};

window.copyMessage = async function (copyButton) {
  const messageContainer = copyButton.closest(".message");
  const textElement = messageContainer?.querySelector(".text");
  const messageText = textElement?.innerText?.trim() || "";

  if (!messageText) {
    console.error("Copy failed: No message text was found.");
    showCopyStatus(copyButton, false);
    return;
  }

  try {
    // This normally works when the chatbot is opened directly,
    // but Google Sites may block it inside a full-page embed.
    if (
      window.isSecureContext &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(messageText);
      showCopyStatus(copyButton, true);
      return;
    }
  } catch (clipboardError) {
    console.warn(
      "Clipboard API was blocked. Trying fallback copy.",
      clipboardError,
    );
  }

  try {
    const copied = fallbackCopyText(messageText);

    if (!copied) {
      throw new Error("The fallback copy command was rejected.");
    }

    showCopyStatus(copyButton, true);
  } catch (fallbackError) {
    console.error("Fallback copy failed:", fallbackError);
    showManualCopyDialog(messageText, copyButton);
  }
};

function fallbackCopyText(text) {
  const textArea = document.createElement("textarea");

  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.setAttribute("aria-label", "Chatbot response");

  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "-9999px";
  textArea.style.width = "1px";
  textArea.style.height = "1px";
  textArea.style.opacity = "0";

  document.body.appendChild(textArea);

  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, text.length);

  let copied = false;

  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textArea);
  }

  return copied;
}

function showCopyStatus(copyButton, succeeded) {
  copyButton.innerText = succeeded ? "done" : "error";
  copyButton.title = succeeded ? "Copied to clipboard" : "Unable to copy";

  setTimeout(() => {
    copyButton.innerText = "content_copy";
    copyButton.title = "Copy response";
  }, 1500);
}

function showManualCopyDialog(text, copyButton) {
  const existingDialog = document.querySelector(".manual-copy-dialog");

  if (existingDialog) {
    existingDialog.remove();
  }

  const overlay = document.createElement("div");
  overlay.className = "manual-copy-overlay";

  const dialog = document.createElement("div");
  dialog.className = "manual-copy-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Copy the chatbot response manually");

  const heading = document.createElement("h2");
  heading.textContent = "Copy response";

  const instruction = document.createElement("p");
  instruction.textContent =
    "Automatic copying is blocked by the embedded page. Select the text below, then press Ctrl+C or use Copy from the browser menu.";

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.readOnly = true;
  textArea.setAttribute("aria-label", "Chatbot response to copy");

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.className = "manual-copy-close";

  const closeDialog = () => {
    overlay.remove();
    copyButton.focus();
  };

  closeButton.addEventListener("click", closeDialog);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeDialog();
    }
  });

  dialog.appendChild(heading);
  dialog.appendChild(instruction);
  dialog.appendChild(textArea);
  dialog.appendChild(closeButton);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, textArea.value.length);
}

const handleOutgoingChat = (providedMessage = "") => {
  if (!typingForm || !typingInput || !chatContainer) {
    console.error("Required chatbot HTML elements were not found.");
    return;
  }

  const currentMessage = providedMessage.trim() || typingInput.value.trim();

  if (!currentMessage || isResponseGenerating) return;

  userMessage = currentMessage;
  isResponseGenerating = true;

  const html = `<div class="message-content">
                  <img class="avatar" src="images/user.jpg" alt="User avatar">
                  <p class="text"></p>
                </div>`;

  const outgoingMessageDiv = createMessageElement(html, "outgoing");

  outgoingMessageDiv.querySelector(".text").textContent = currentMessage;

  chatContainer.appendChild(outgoingMessageDiv);
  typingForm.reset();
  typingInput.style.height = "auto";
  document.body.classList.add("hide-header");

  saveVisibleChats();
  scrollToBottom();

  setTimeout(() => {
    showLoadingAnimation(currentMessage);
  }, 300);
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

if (typingForm) {
  typingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleOutgoingChat();
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
      localStorage.removeItem("chat-history");
      conversationHistory = [];
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
        localStorage.removeItem("chat-history");
        conversationHistory = [];

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

loadDataFromLocalstorage();
