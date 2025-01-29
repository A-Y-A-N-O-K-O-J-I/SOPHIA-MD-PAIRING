# SOPHIA MD PAIRING CODE LOGIC USING DROPBOX DB

## INFO
Sophia MD pairing using dropbox isn't really easy but its the best way to optimise ram use.
- Fork, Star and Edit as you wish
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

run this code on any nodejs server after getting the code (local testing recommended) 
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
 You should get an output looking like this 
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
#### Info: Dropbox Access tokens expires after 4 hours but i made a method that would make it permanent using the refresh token
```js

const lol = {}
```
 
##### Note: Use a work email address a personal address will bring problems.


