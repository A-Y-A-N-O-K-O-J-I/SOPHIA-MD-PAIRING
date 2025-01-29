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

##### Note: Use a work email address a personal address will bring problems.


