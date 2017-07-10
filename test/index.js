'use strict';

var fs = require('fs');
var http = require('http');
var prepare = require('../');

var HTML_STRING = fs.readFileSync(__dirname + '/test.html', 'utf8');
var JS_STRING = 'alert("foo");';
var html = prepare(HTML_STRING, {'content-type': 'html'});
var script = prepare(JS_STRING, {'content-type': 'js', 'cache-control': '1 year'});
var scriptNoGzip = prepare(HTML_STRING, {'content-type': 'html'}, {gzip: false});

function next(err) {
  throw err;
}
const server = http.createServer((req, res) => {
  switch (req.url) {
    case '/':
      html.send(req, res, next);
      break;
    case '/client.js':
      script.send(req, res, next);
      break;
    case '/no-gzip':
      scriptNoGzip.send(req, res, next);
      break;
  }
});

server.listen(3000);

var assert = require('assert');
var http = require('http');
var zlib = require('zlib');
var Promise = require('promise');
var concat = require('concat-stream');
var test = require('testit');

function request(path, headers) {
  return new Promise(function (resolve, reject) {
    http.request({
      host: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      headers: headers
    }, function (res) {
      res.on('error', reject);
      res.pipe(concat(function (body) {
        resolve({statusCode: res.statusCode, body: body, headers: res.headers});
      }));
    }).on('error', reject).end();
  });
}
function gunzip(body) {
  return new Promise(function (resolve, reject) {
    zlib.gunzip(body, function (err, res) {
      if (err) reject(err);
      else resolve(res);
    }.bind(this));
  });
}
test('raw-request', function () {
  return request('/', {}).then(function (res) {
    assert(res.statusCode === 200);
    assert(res.body.toString() === HTML_STRING);
    assert(res.headers.vary === 'Accept-Encoding');
    assert(res.headers.etag === '76f7dd7da1deaa8cec3648c1f4790852');
    assert(res.headers['content-length'] === '16530');
    assert(res.headers['content-type'] === 'text/html');
  });
});
test('gzip-request', function () {
  return request('/', {'accept-Encoding': 'gzip'}).then(function (res) {
    assert(res.statusCode === 200);
    assert(res.headers.vary === 'Accept-Encoding');
    assert(res.headers.etag === '76f7dd7da1deaa8cec3648c1f4790852');
    assert(res.headers['content-length'] === '4525');
    assert(res.headers['content-type'] === 'text/html');
    assert(res.headers['content-encoding'] === 'gzip');
    return gunzip(res.body);
  }).then(function (body) {
    assert(body.toString() === HTML_STRING);
  });
});
test('etag-request', function () {
  return request('/', {'if-None-Match': '76f7dd7da1deaa8cec3648c1f4790852'}).then(function (res) {
    assert(res.statusCode === 304);
    assert(res.body.length === 0);
  });
});


test('raw-request-2', function () {
  return request('/client.js', {}).then(function (res) {
    assert(res.statusCode === 200);
    assert(res.body.toString() === JS_STRING);
    assert(res.headers.vary !== 'Accept-Encoding');
    assert(res.headers.etag === 'af5c77b360ffe88dbed4b3d71e3d0eba');
    assert(res.headers['content-length'] === '13');
    assert(res.headers['content-type'] === 'application/javascript');
    assert(res.headers['cache-control'] === 'public, max-age=31557600');
  });
});
test('gzip-request-2', function () {
  // won't actually gzip because the text response is shorter without gzip
  return request('/client.js', {'accept-Encoding': 'gzip'}).then(function (res) {
    assert(res.statusCode === 200);
    assert(res.body.toString() === JS_STRING);
    assert(res.headers.vary !== 'Accept-Encoding');
    assert(res.headers.etag === 'af5c77b360ffe88dbed4b3d71e3d0eba');
    assert(res.headers['content-length'] === '13');
    assert(res.headers['content-type'] === 'application/javascript');
    assert(res.headers['cache-control'] === 'public, max-age=31557600');
    assert(res.headers['content-encoding'] !== 'gzip');
  });
});


test('raw-request gzip=false', function () {
  return request('/no-gzip', {}).then(function (res) {
    assert(res.statusCode === 200);
    assert(res.body.toString() === HTML_STRING);
    assert(res.headers.vary !== 'Accept-Encoding');
    assert(res.headers.etag === '76f7dd7da1deaa8cec3648c1f4790852');
    assert(res.headers['content-length'] === '16530');
    assert(res.headers['content-type'] === 'text/html');
  });
});
test('gzip-request gzip=false', function () {
  return request('/no-gzip', {'accept-Encoding': 'gzip'}).then(function (res) {
    assert(res.statusCode === 200);
    assert(res.body.toString() === HTML_STRING);
    assert(res.headers.vary !== 'Accept-Encoding');
    assert(res.headers.etag === '76f7dd7da1deaa8cec3648c1f4790852');
    assert(res.headers['content-length'] === '16530');
    assert(res.headers['content-type'] === 'text/html');
  });
});
test('etag-request gzip=false', function () {
  return request('/no-gzip', {'if-None-Match': '76f7dd7da1deaa8cec3648c1f4790852'}).then(function (res) {
    assert(res.statusCode === 304);
    assert(res.body.length === 0);
  });
});

test('cleanup', function () {
  server.close();
});
