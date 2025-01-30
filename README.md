# SOPHIA MD PAIRING CODE LOGIC USING DROPBOX DB

## INFO
Sophia MD pairing uses dropbox database and it wasn't really easy but its the best way to optimise ram use.
- Fork, Star and Edit as you wish(don't forget to give credit when editing)
- Deploy to your favourite hosting server eg Heroku or Render or self hosting
- This is what I use in my **[Session Site](https://sophia-md-pair.vercel.app)**

## HOW TO AUTHENTICATE DROPBOX DB
Create a **[dropbox](https://dropbox.com/signup)** account 

Then go to the **[developer section](https://dropbox.com/developers)**
Then you create an app give it any name you want 

After creating the app you should see something like this


![DROPBOX](https://files.catbox.moe/cdl0my.jpg)
Copy the api key and the secret and store them safe. it'll be used later

in the permission section of the app check ✅ everything pertaining file like this

![DROPBOX](https://files.catbox.moe/mr6e9k.jpg)

after that run this on your browser 
```
https://www.dropbox.com/oauth2/authorize?client_id=<YOURAPPKEY>&token_access_type=offline&response_type=code
```
you should get a long code looking like this 'YGg1ZWd-LIAAAAAAAAAFHeCpM-tbGNlc43s_LnGg'

#### run this code on any nodejs server after getting the code (local testing recommended) 
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
 #### You should get an output looking like this 
 ```js
 Tokens: {
  access_token: 'sl.CFVUzd_lpDoe9zm9lZjvsXd3cxNbacAb3iVUi95PiNyN3FxSZyecfENHDpS0AQaKHiegmnkPLB8i5NUN5FZF2StBvovi7v5CcMphd-2oBK3QUvsgX8DN9HE',
  token_type: 'bearer',
  expires_in: 14400,
  refresh_token: 'x-8GMxBxYM6GraNP7TUVoEBZ9_1mIdQ1A',
  scope: 'account_info.read contacts.read contacts.write file_requests.read file_requests.write files.content.write files.metadata.read files.metadata.write sharing.read sharing.write',
  uid: '1578775219',
  account_id: 'dbid:AAD7RhoDKt5Pq2bQOH_ARMw4ENQk3cXmacw'
}
```
#### Dropbox Access tokens expires after 4 hours but i made a method that would make it permanent using the refresh token
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

// 1. Upload File Helper
async function uploadFile(localFilePath, dropboxPath) {
    try {
        const url = 'https://content.dropboxapi.com/2/files/upload';
        const fileContent = fs.readFileSync(localFilePath); // Read the file content
        const accessToken = await refreshAccessToken(); // Fetch the updated access token

        const response = await axios.post(url, fileContent, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Dropbox-API-Arg': JSON.stringify({
                    path: dropboxPath, // Path in Dropbox (e.g., '/folder/file.txt')
                    mode: 'add',
                    autorename: true,
                    mute: false,
                }),
                'Content-Type': 'application/octet-stream',
            },
        });

        const result = response.data;
        const session = `sophia_md~${result.rev}`;
        console.log('File uploaded successfully:', result);
        return session;
    } catch (error) {
        console.error('Error uploading file:', error.response?.data || error.message);
    }
}
```

#### For downloading the creds from Dropbox you use fetch instead of axios or else you'll get a 403 error
```js

const clientId = process.env.APPKEY;
const clientSecret = process.env.APP_SECRET;
const refreshToken = process.env.REFRESH_TOKEN; // Save this securely
const axios = require('axios')
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

async function downloadFile(sessionID) {
  const rev = sessionID.split('~')[1];
    try {
        const url = 'https://content.dropboxapi.com/2/files/download';
        const accessToken = await refreshAccessToken();

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Dropbox-API-Arg': JSON.stringify({
                    path: `rev:${rev}`, // Path in Dropbox (e.g., '/folder/file.txt')
                }),
            },
        });

        if (!response.ok) {
            console.error('Error downloading file:', await response.text());
            return null;  
        }
        const content = Buffer.from(await response.arrayBuffer());
        return content; // Return the Buffer
    } catch (error) {
        console.error('Error downloading file:', error);
        return null;
    }
}

module.exports = { downloadFile }
```

Now you're all set to use dropbox database for your session connection.
##### Note: Use a work email address. A personal address will bring problems.


