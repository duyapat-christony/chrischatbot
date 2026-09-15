const typingForm = document.querySelector(".typing-form");
const chatContainer = document.querySelector(".chat-list");
const typingInput = document.querySelector(".typing-input");
const suggestions = document.querySelectorAll(".suggestion");
const toggleThemeButton = document.querySelector("#theme-toggle-button");
const deleteChatButton = document.querySelector("#delete-chat-button");

const NETLIFY_FUNCTION_URL = "/.netlify/functions/gemini";

let userMessage = "";
let isResponseGenerating = false;

/**
 * Load saved chats and theme.
 */
const loadDataFromLocalStorage = () => {
  const savedChats = localStorage.getItem("saved-chats");
  const savedTheme = localStorage.getItem("themeColor") || "light_mode";

  document.body.classList.remove("light_mode", "dark_mode");
  document.body.classList.add(savedTheme);

  if (toggleThemeButton) {
    toggleThemeButton.innerText =
      savedTheme === "dark_mode" ? "light_mode" : "dark_mode";
  }

  if (chatContainer) {
    chatContainer.innerHTML = savedChats || "";

    document.body.classList.toggle("hide-header", Boolean(savedChats));

    scrollToBottom();
  }

  // Run this only if the function exists in another script.
  if (typeof displayRandomQuestions === "function") {
    displayRandomQuestions();
  }
};

/**
 * Scroll to the newest message.
 */
const scrollToBottom = () => {
  if (!chatContainer) return;

  chatContainer.scrollTo({
    top: chatContainer.scrollHeight,
    behavior: "smooth",
  });
};

/**
 * Save chat messages in localStorage.
 */
const saveChats = () => {
  if (!chatContainer) return;

  localStorage.setItem("saved-chats", chatContainer.innerHTML);
};

/**
 * Create a message wrapper.
 */
const createMessageElement = (...classes) => {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", ...classes);

  return messageDiv;
};

/**
 * Add an outgoing user message.
 */
const createOutgoingMessage = (message) => {
  const messageDiv = createMessageElement("outgoing");

  const messageContent = document.createElement("div");
  messageContent.className = "message-content";

  const avatar = document.createElement("img");
  avatar.className = "avatar";
  avatar.src = "images/user.jpg";
  avatar.alt = "User avatar";

  const text = document.createElement("p");
  text.className = "text";
  text.textContent = message;

  messageContent.appendChild(avatar);
  messageContent.appendChild(text);
  messageDiv.appendChild(messageContent);

  return messageDiv;
};

/**
 * Add a loading message for the chatbot.
 */
const createIncomingLoadingMessage = () => {
  const messageDiv = createMessageElement("incoming", "loading");

  const messageContent = document.createElement("div");
  messageContent.className = "message-content";

  const avatar = document.createElement("img");
  avatar.className = "avatar";
  avatar.src = "images/gemini.svg";
  avatar.alt = "Chatbot avatar";

  const text = document.createElement("p");
  text.className = "text";

  const loadingIndicator = document.createElement("div");
  loadingIndicator.className = "loading-indicator";

  for (let index = 0; index < 3; index += 1) {
    const loadingBar = document.createElement("div");
    loadingBar.className = "loading-bar";
    loadingIndicator.appendChild(loadingBar);
  }

  const copyButton = document.createElement("span");
  copyButton.className = "icon material-symbols-rounded copy-button";
  copyButton.textContent = "content_copy";
  copyButton.title = "Copy response";
  copyButton.setAttribute("role", "button");
  copyButton.setAttribute("tabindex", "0");
  copyButton.style.float = "right";

  copyButton.addEventListener("click", () => {
    copyMessage(copyButton);
  });

  copyButton.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      copyMessage(copyButton);
    }
  });

  messageContent.appendChild(avatar);
  messageContent.appendChild(text);
  messageContent.appendChild(loadingIndicator);

  messageDiv.appendChild(messageContent);
  messageDiv.appendChild(copyButton);

  return messageDiv;
};

/**
 * Ask the Netlify function for a chatbot response.
 */
const generateAPIResponse = async (incomingMessageDiv, message) => {
  const textElement = incomingMessageDiv.querySelector(".text");

  try {
    const response = await fetch(NETLIFY_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message,
      }),
    });

    const rawResponse = await response.text();

    let data;

    try {
      data = rawResponse ? JSON.parse(rawResponse) : {};
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

    // textContent is safer than innerHTML because it prevents
    // generated HTML or scripts from being inserted into the page.
    textElement.textContent = data.reply;

    incomingMessageDiv.classList.remove("error");
    saveChats();
  } catch (error) {
    console.error("Chatbot request error:", error);

    textElement.textContent =
      error.message || "Unable to connect to the chatbot.";

    incomingMessageDiv.classList.add("error");
  } finally {
    isResponseGenerating = false;
    incomingMessageDiv.classList.remove("loading");
    scrollToBottom();

    if (typingInput) {
      typingInput.focus();
    }
  }
};

/**
 * Display the loading animation and start the request.
 */
const showLoadingAnimation = (message) => {
  const incomingMessageDiv = createIncomingLoadingMessage();

  chatContainer.appendChild(incomingMessageDiv);
  scrollToBottom();

  generateAPIResponse(incomingMessageDiv, message);
};

/**
 * Copy a chatbot response.
 */
const copyMessage = async (copyButton) => {
  const messageDiv = copyButton.closest(".message");
  const messageText = messageDiv?.querySelector(".text")?.innerText || "";

  if (!messageText) return;

  try {
    await navigator.clipboard.writeText(messageText);

    copyButton.textContent = "done";

    window.setTimeout(() => {
      copyButton.textContent = "content_copy";
    }, 1000);
  } catch (error) {
    console.error("Clipboard error:", error);
  }
};

/**
 * Send the current message.
 */
const handleOutgoingChat = (providedMessage = "") => {
  if (!typingForm || !typingInput || !chatContainer) {
    console.error("Required chatbot HTML elements were not found.");
    return;
  }

  const message = providedMessage.trim() || typingInput.value.trim();

  if (!message || isResponseGenerating) {
    return;
  }

  userMessage = message;
  isResponseGenerating = true;

  const outgoingMessageDiv = createOutgoingMessage(userMessage);

  chatContainer.appendChild(outgoingMessageDiv);

  typingForm.reset();
  typingInput.style.height = "auto";

  document.body.classList.add("hide-header");

  scrollToBottom();
  saveChats();

  window.setTimeout(() => {
    showLoadingAnimation(userMessage);
  }, 300);
};

/**
 * Automatically resize the typing box.
 */
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

/**
 * Handle the chat form submission.
 */
if (typingForm) {
  typingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleOutgoingChat();
  });
}

/**
 * Handle suggestion buttons.
 */
suggestions.forEach((suggestion) => {
  suggestion.addEventListener("click", () => {
    const suggestionText = suggestion.querySelector(".text")?.innerText.trim();

    if (suggestionText) {
      handleOutgoingChat(suggestionText);
    }
  });
});

/**
 * Change between light and dark modes.
 */
if (toggleThemeButton) {
  toggleThemeButton.addEventListener("click", () => {
    const isCurrentlyDark = document.body.classList.contains("dark_mode");

    const newTheme = isCurrentlyDark ? "light_mode" : "dark_mode";

    document.body.classList.remove("light_mode", "dark_mode");

    document.body.classList.add(newTheme);

    localStorage.setItem("themeColor", newTheme);

    toggleThemeButton.innerText =
      newTheme === "dark_mode" ? "light_mode" : "dark_mode";
  });
}

/**
 * Delete all saved chats.
 */
if (deleteChatButton) {
  deleteChatButton.addEventListener("click", () => {
    const deleteChats = () => {
      localStorage.removeItem("saved-chats");
      window.location.reload();
    };

    // Use SweetAlert2 when it loaded successfully.
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

        Swal.fire({
          title: "Deleted!",
          text: "All your chats have been deleted.",
          icon: "success",
        }).then(() => {
          window.location.reload();
        });
      });
    } else {
      // Browser fallback if SweetAlert2 is unavailable.
      const confirmed = window.confirm(
        "Are you sure you want to delete all chats?",
      );

      if (confirmed) {
        deleteChats();
      }
    }
  });
}

loadDataFromLocalStorage();
