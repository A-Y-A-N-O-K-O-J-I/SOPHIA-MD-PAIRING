# 🌟 SOPHIA MD PAIRING CODE LOGIC USING DROPBOX DB 🌟

## 📝 Introduction
Sophia MD pairing uses **Dropbox as a database**, making it super lightweight and optimized for RAM usage. 🚀 It wasn’t easy to set up, but it's the best way to handle sessions efficiently!  

### 🎯 Why Use This?
✅ Reduces RAM usage 📉  
✅ Works seamlessly on **Heroku, Render, or self-hosted** setups 💻  
✅ Secure & reliable storage for your bot's session 🔐  

👉 This is what I personally use for my **[Session Site](https://sophia-md-pair.vercel.app)**! Feel free to **fork, star, and modify** it—but don’t forget to give credit! 😉  

---

## 🔑 How to Authenticate Dropbox DB  
First, you need a **Dropbox account** and a **Dropbox App** for authentication. Here’s how:

### 1️⃣ Create a Dropbox App  
👉 [Sign up for Dropbox](https://dropbox.com/signup) (if you don’t have an account).  
👉 Go to the **[Developer Section](https://dropbox.com/developers)** and create an app.  
👉 Give it any name you like, and once created, you'll see this:

📸 **(Example Screenshot)**  
![DROPBOX](https://files.catbox.moe/cdl0my.jpg)  

👉 Copy the **API Key & Secret** and **store them safely**! 🔐  

### 2️⃣ Enable File Permissions  
Go to the **Permissions Section** and check ✅ all file-related permissions:  

📸 **(Example Screenshot)**  
![DROPBOX](https://files.catbox.moe/mr6e9k.jpg)  

---

## 🔗 Get Your Authentication Code
Run this URL in your browser (replace `<YOURAPPKEY>` with your actual key):  

```
https://www.dropbox.com/oauth2/authorize?client_id=<YOURAPPKEY>&token_access_type=offline&response_type=code
```

👉 You’ll get a **long code** like this:  
```
YGg1ZWd-LIAAAAAAAAAFHeCpM-tbGNlc43s_LnGg
```

---

## 🔄 Exchange Code for Access Tokens
Run this **Node.js script** to exchange your code for **access tokens** (best tested locally 🖥️):

```js
const axios = require('axios');

async function getTokens(authCode) {
    try {
        const response = await axios.post('https://api.dropboxapi.com/oauth2/token', null, {
            params: {                                                           
                code: authCode,
                grant_type: 'authorization_code',
                client_id: '<APP KEY>',
                client_secret: '<APP SECRET>',                           
            },
        });
        console.log('Tokens:', response.data);
    } catch (error) {
        console.error('Error exchanging authorization code:', error.response?.data || error.message);
    }
}

// Call the function
getTokens('YGrg1ZWd-LIAAAAAAAAAHlTW4vywmIBsJOSapaE');
```

---

## 🛠️ Token Response Example

Once the script runs, you’ll get this response:
```js
Tokens: {
  access_token: 'sl.CFVUzd_lpDoe9zm9lZjvsXd3cxNbacAb3iVUi95PiNyN3FxSZyecfENHDpS0AQaKHiegmnkPLB8i5NUN5FZF2StBvovi7v5CcMphd-2oBK3QUvsgX8DN9HE',
  token_type: 'bearer',
  expires_in: 14400, // 4 hours
  refresh_token: 'x-8GMxBxYM6GraNP7TUVoEBZ9_1mIdQ1A',
  scope: 'files.metadata.read files.metadata.write files.content.write sharing.read sharing.write',
  uid: '1578775219',
  account_id: 'dbid:AAD7RhoDKt5Pq2bQOH_ARMw4ENQk3cXmacw'
}

```
---


## 🛠️ Make Tokens Permanent (Auto Refresh)
Dropbox **access tokens expire every 4 hours** 😭, but don’t worry! We’ll use a refresh token to **keep them alive forever**! 🌱  

```js
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const refreshToken = process.env.REFRESH_TOKEN;

async function refreshAccessToken() {
    try {
        const response = await axios.post('https://api.dropboxapi.com/oauth2/token', null, {
            params: {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
            },
        });

        const newAccessToken = response.data.access_token;
        return newAccessToken; // Return the new access token
    } catch (error) {
        console.error('Error refreshing access token:', error.response?.data || error.message);
        throw error;
    }
}
```

---

## 📤 Upload Files to Dropbox
Now, let’s **upload files** to Dropbox! 📂  

```js
const fs = require('fs');

async function uploadFile(localFilePath, dropboxPath) {
    try {
        const url = 'https://content.dropboxapi.com/2/files/upload';
        const fileContent = fs.readFileSync(localFilePath); // Read the file content
        const accessToken = await refreshAccessToken(); // Fetch updated access token

        const response = await axios.post(url, fileContent, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Dropbox-API-Arg': JSON.stringify({
                    path: dropboxPath, // Example: '/folder/file.txt'
                    mode: 'add',
                    autorename: true,
                    mute: false,
                }),
                'Content-Type': 'application/octet-stream',
            },
        });

        const result = response.data;
        const session = `sophia_md~${result.rev}`;
        console.log(' File uploaded successfully:', result);
        return session;
    } catch (error) {
        console.error(' Error uploading file:', error.response?.data || error.message);
    }
}
```

---

## 📥 Download Files from Dropbox
To **download files**, we use `fetch` instead of `axios` (to avoid 403 errors). 🛑  

```js
const fetch = require('node-fetch');

async function downloadFile(sessionID) {
    const rev = sessionID.split('~')[1]; // Extract revision ID
    try {
        const url = 'https://content.dropboxapi.com/2/files/download';
        const accessToken = await refreshAccessToken();

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Dropbox-API-Arg': JSON.stringify({
                    path: `rev:${rev}`, // Fetch file using revision ID
                }),
            },
        });

        if (!response.ok) {
            console.error(' Error downloading file:', await response.text());
            return null;
        }

        const content = Buffer.from(await response.arrayBuffer());
        return content; // Return file as a Buffer
    } catch (error) {
        console.error(' Error downloading file:', error);
        return null;
    }
}

module.exports = { downloadFile };
```

---

## 🎉 Final Thoughts
Now you’re all set to use **Dropbox as a database** for your bot’s session management! 🎊  

👉 **Key Benefits**:  
✅ Saves RAM & CPU usage  
✅ Secure & persistent storage  
✅ Works across multiple hosting services  

🔗 **For more details, check out Dropbox’s official docs!**  

🚨 **Note:** Use a **work email** to register! Personal emails might cause issues. 🚀  
