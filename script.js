const typingForm = document.querySelector(".typing-form");
const chatContainer = document.querySelector(".chat-list");
const typingInput = typingForm.querySelector(".typing-input");
const suggestions = document.querySelectorAll(".suggestion");
const toggleThemeButton = document.querySelector("#theme-toggle-button");
const deleteChatButton = document.querySelector("#delete-chat-button");

// State variables
let userMessage = null;
let isResponseGenerating = false;

// Netlify Endpoint (Replaces direct Google API config)
const NETLIFY_FUNCTION_URL = "/.netlify/functions/gemini";

// Load theme and chat data from local storage on page load
const loadDataFromLocalstorage = () => {
  const savedChats = localStorage.getItem("saved-chats");

  // Apply light mode as the default theme
  displayRandomQuestions();
  document.body.classList.add("light_mode");
  toggleThemeButton.innerText = "dark_mode"; // Set button to allow toggling to dark mode

  // Restore saved chats or clear the chat container
  chatContainer.innerHTML = savedChats || "";
  document.body.classList.toggle("hide-header", savedChats);

  chatContainer.scrollTo(0, chatContainer.scrollHeight); // Scroll to the bottom
};

// Create a new message element and return it
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

// Fetch response from the Netlify Serverless Function based on user message
const generateAPIResponse = async (incomingMessageDiv) => {
  const textElement = incomingMessageDiv.querySelector(".text"); // Getting text element

  try {
    // Send a POST request to your secure Netlify function
    const response = await fetch(NETLIFY_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to fetch response");

    // Get the API response text and remove asterisks from it
    const apiResponse = data?.candidates[0].content.parts[0].text
      .replace(/\*\*(.*?)\*\*/g, "$1") // Remove double asterisks and retain inner text
      .replace(/\$(.*?)\$/g, "$1"); // Remove dollar signs and retain inner text

    textElement.innerHTML = apiResponse;
    isResponseGenerating = false;
    localStorage.setItem("saved-chats", chatContainer.innerHTML);
    chatContainer.scrollTo(0, chatContainer.scrollHeight);
  } catch (error) {
    // Handle error
    isResponseGenerating = false;
    textElement.innerText = error.message;
    textElement.parentElement.closest(".message").classList.add("error");
  } finally {
    incomingMessageDiv.classList.remove("loading");
  }
};

// Show a loading animation while waiting for the API response
const showLoadingAnimation = () => {
  const html = `<div class="message-content">
                  <img class="avatar" src="images/gemini.svg" alt="Gemini avatar">
                  <p class="text"></p>
                  <div class="loading-indicator">
                    <div class="loading-bar"></div>
                    <div class="loading-bar"></div>
                    <div class="loading-bar"></div>
                  </div>
                </div>
                <span onClick="copyMessage(this)" class="icon material-symbols-rounded" style="float: right;">content_copy</span>`;

  const incomingMessageDiv = createMessageElement(html, "incoming", "loading");
  chatContainer.appendChild(incomingMessageDiv);

  chatContainer.scrollTo(0, chatContainer.scrollHeight); // Scroll to the bottom
  generateAPIResponse(incomingMessageDiv);
};

// Copy message text to the clipboard
const copyMessage = (copyButton) => {
  const messageText = copyButton.parentElement.querySelector(".text").innerText;

  navigator.clipboard.writeText(messageText);
  copyButton.innerText = "done"; // Show confirmation icon
  setTimeout(() => (copyButton.innerText = "content_copy"), 1000); // Revert icon after 1 second
};

// Adjust the height of the textarea dynamically
typingInput.addEventListener("input", () => {
  typingInput.style.height = "auto";
  typingInput.style.height = typingInput.scrollHeight + "px";
});

// Handle "Shift + Enter" for new lines and "Enter" for sending messages
typingInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleOutgoingChat();
  }
});

// Handle sending outgoing chat messages
const handleOutgoingChat = () => {
  userMessage =
    typingForm.querySelector(".typing-input").value.trim() || userMessage;
  if (!userMessage || isResponseGenerating) return; // Exit if there is no message or response is generating

  isResponseGenerating = true;

  const html = `<div class="message-content">
                  <img class="avatar" src="images/user.jpg" alt="User avatar">
                  <p class="text"></p>
                </div>`;

  const outgoingMessageDiv = createMessageElement(html, "outgoing");
  outgoingMessageDiv.querySelector(".text").innerText = userMessage;
  chatContainer.appendChild(outgoingMessageDiv);

  typingForm.reset(); // Clear input field
  typingInput.style.height = "auto";
  document.body.classList.add("hide-header");
  chatContainer.scrollTo(0, chatContainer.scrollHeight); // Scroll to the bottom
  setTimeout(showLoadingAnimation, 500); // Show loading animation after a delay
};

// Toggle between light and dark themes
toggleThemeButton.addEventListener("click", () => {
  const isLightMode = document.body.classList.toggle("dark_mode");
  localStorage.setItem("themeColor", isLightMode ? "dark_mode" : "light_mode");
  toggleThemeButton.innerText = isLightMode ? "light_mode" : "dark_mode";
});

// Delete all chats from local storage when button is clicked
deleteChatButton.addEventListener("click", () => {
  Swal.fire({
    title: "Delete chats?",
    text: "Are you sure you want to delete all chats?",
    icon: "warning",
    reverseButtons: true,
    showCancelButton: true,
    confirmButtonText: "Delete",
    cancelButtonText: "Cancel",
  }).then((result) => {
    if (result.isConfirmed) {
      localStorage.removeItem("saved-chats");
      // Reload the page to restart the chatbot and restore the initial state
      Swal.fire(
        "Deleted!",
        "All your chats have been deleted.",
        "success",
      ).then(() => {
        window.location.reload(); // Refresh the page
      });
    }
  });
});

// Set userMessage and handle outgoing chat when a suggestion is clicked
suggestions.forEach((suggestion) => {
  suggestion.addEventListener("click", () => {
    userMessage = suggestion.querySelector(".text").innerText;
    handleOutgoingChat();
  });
});

// Prevent default form submission and handle outgoing chat
typingForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleOutgoingChat();
});

loadDataFromLocalstorage();
