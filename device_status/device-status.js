/*
  Copyright (c) 2020 by Lilee Technology, Ltd.
  All rights reserved.  
  Reference script to --
  1. retrieve / renew T-Cloud customer API access token using HMAC.
  2. inquire for device status information.
*/

// import
const crypto = require('crypto');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const fs = require("fs");

// some variables
const tcloud = 't-cloud';
const url = 'https://service.' + tcloud + '.lileesystems.com/api/v3';
const url_hmac = url + '/auth/grant';
const url_renew = url + '/auth/grant/renew';
const algo = 'sha256';
var url_api = null;
var domain = null;
var username = null;
var secret = null;
var scope = null;
var authorization = null;
var tokenSet = null;
var api_ok = true;

function readConfig() {
  console.log('Read API access configuration')

  // read the config file
  var access = fs.readFileSync("access.json");
  var context = JSON.parse(access);

  // get the config attributes
  domain = context.domain;
  url_api = url + context.api + '?org_name=' + domain;;
  scope = JSON.parse('{"scope":' + JSON.stringify(context.scope) +'}');
  username = context.username;
  secret = context.secret;
}

function newToken() {
  console.log('Get a new token');

  var date = new Date().toISOString();
  var digest = crypto.createHash(algo).update(JSON.stringify(scope)).digest('base64');

  // Authentication signature
  var login = 'x-date: ' + date + '\ndomain: ' + domain + '\ndigest: ' + digest;
  var signature = crypto.createHmac(algo, secret).update(login).digest('base64');
  // HMAC authorization string
  authorization = 'HMAC username="' + username + '", algorithm="hmac-sha256", headers="x-date domain digest", signature="' + signature + '"';

  // for debug
  console.log('HMAC Req URL  :', url_hmac);
  console.log('Domain        :', domain);
  console.log('Username      :', username);
  console.log('Scope         :', JSON.stringify(scope));
  console.log('Digest        :', digest);
  console.log('Date          :', date);
  console.log('Login         :', login);
  console.log('Signature     :', signature);
  console.log('Authorization :', authorization);

  // XML HTTP handler
  var xhr = new XMLHttpRequest();
  tokenExpiration = 0;
  tokenSet = null;
  // listen for `load` event
  xhr.onload = () => {
    // print JSON response
    var response = JSON.parse(xhr.responseText);
    console.log('\nResponse:\n', response);

    if (response.access_token != undefined) {
      var now = new Date().getTime() / 1000;
      tokenExpiration = now + response.expires_in;
      console.log('New token at :        ', now);
      console.log('New token expiration :', tokenExpiration);
      // assign the tokenSet so the api query can start
      tokenSet = response;
    }
  };

  // construct the POST request
  xhr.open("POST", url_hmac);
  xhr.setRequestHeader('accept', 'application/json');
  xhr.setRequestHeader('Authorization', authorization);
  xhr.setRequestHeader('Domain', domain);
  xhr.setRequestHeader('X-Date', date);
  xhr.setRequestHeader('Digest', digest);
  xhr.setRequestHeader('Content-Type', 'application/json');
  // send POST request
  xhr.send(JSON.stringify(scope));
}


// Renew token
function renewToken() {
  console.log('Renew the token');

  // check for the need of renewal
  var now = new Date().getTime() / 1000;
  if ((now + 60) < tokenExpiration) {
    console.log('No need to renew');
    return;
  }

  console.log('Now (expires soon) :', now);
  console.log('Token Expiration   :', tokenExpiration);

  // blank the tokenSet
  var tokenSetOld = tokenSet;
  tokenSet = null;

  // construct the PUT request
  var xhr = new XMLHttpRequest();
  xhr.open("PUT", url_renew);
  xhr.setRequestHeader('accept', 'application/json');
  xhr.setRequestHeader('Authorization', authorization);
  xhr.setRequestHeader('Domain', domain);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = function() {
    // update the token object, it may fail...
    tokenSet = JSON.parse(xhr.responseText)
    console.log('\nResponse:\n', tokenSet);

    if (tokenSet.access_token != undefined) {
      var now = new Date().getTime() / 1000;
      tokenExpiration = now + tokenSet.expires_in;
      console.log('Renewed token at :        ', now);
      console.log('Renewed token expiration :', tokenExpiration);
    }
  };
  xhr.send(JSON.stringify(tokenSetOld));
}

// get device status every 10 seconfs, and renew token when now + 60 sec > expiration
function getDeviceStatus(set) {
  console.log('Get device status');
  api_ok = false;

  renewToken();

  // tokenSet can be set to null when being renewed
  if (tokenSet == null) {
    api_ok = true;
    return;
  }

  var xhr = new XMLHttpRequest();
  console.log('URL: ', url_api);
  xhr.open("GET", url_api);
  xhr.setRequestHeader('accept', 'application/json');
  xhr.setRequestHeader('Authorization', tokenSet.token_type + ' ' + tokenSet.access_token);
  xhr.onload = function() {
    var deviceList = JSON.parse(xhr.responseText)
    console.log('\nResponse:\n', deviceList);
    api_ok = true;
  };
  xhr.send();
}

// a delay function to be called from async function
function sleep(timer) {
  return new Promise(resolve => {
    setTimeout( () => {
      resolve()
    }, timer);
  });
};

// iteration to get device status ever 10 seconds
async function getDeviceStatusLoop() {
  // get config
  readConfig();
  // get the Token
  newToken();
  // the iteration to get device status
  var notReadyPrinted = false;
  while (true) {
    if (tokenSet == null) {
      if (notReadyPrinted == false) {
        console.log('Token is not ready');
	notReadyPrinted = true;
      }
      await sleep(1000);
      continue;
    }

    notReadyPrinted = false;
    if (api_ok) {
      getDeviceStatus();
    } else {
      console.log('api call didn\'t return');
    }
    await sleep(10000);
  }
}

getDeviceStatusLoop();
