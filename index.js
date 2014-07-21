'use strict';

var crypto = require('crypto');
var zlib = require('zlib');
var ms = require('ms');
var mime = require('mime');

module.exports = prepareResponse;
function prepareResponse(body, headers) {
  return new PreparedResponse(body, headers);
}
function PreparedResponse(body, headers) {
  if (typeof body === 'string') body = new Buffer(body);
  if (!Buffer.isBuffer(body)) {
    throw new TypeError('Text must be either a buffer or a string');
  }
  this.body = body;
  this.gzippedBody = null;
  this.waiting = [];
  zlib.gzip(body, function (err, res) {
    if (err) {
      console.error(err.stack);
    } else if (res.length < this.body.length) {
      this.gzippedBody = res;
    }
    var waiting = this.waiting;
    this.waiting = null;
    waiting.forEach(function (fn) {
      fn();
    });
  }.bind(this));
  this.etag = md5(body);

  this.headers = Object.keys(headers || {}).map(function (header) {
    var value = headers[header];
    if (header.toLowerCase() === 'cache-control') {
      if (typeof value === 'string' && ms(value)) {
        value = 'public, max-age=' + Math.floor(ms(value) / 1000);
      } else if (typeof headers.cache === 'number') {
        value = 'public, max-age=' + Math.floor(value / 1000);
      }
    }
    if (header.toLowerCase() === 'content-type' && value.indexOf('/') === -1) {
      value = mime.lookup(value);
    }
    return new Header(header, value);
  });
}
PreparedResponse.prototype.send = function (req, res, next) {
  if (this.waiting) {
    return this.waiting.push(this.send.bind(this, req, res, next));
  }

  this.headers.forEach(function (header) {
    header.set(res);
  });

  // vary
  if (!res.getHeader('Vary')) {
    res.setHeader('Vary', 'Accept-Encoding');
  } else if (!~res.getHeader('Vary').indexOf('Accept-Encoding')) {
    res.setHeader('Vary', res.getHeader('Vary') + ', Accept-Encoding');
  }

  //check old etag
  if (req.headers['if-none-match'] === this.etag) {
    res.statusCode = 304;
    res.end();
    return;
  }

  //add new etag
  res.setHeader('ETag', this.etag);

  //add gzip
  if (supportsGzip(req) && this.gzippedBody) {
    res.setHeader('Content-Encoding', 'gzip');
    // res.setHeader('Content-Length', this.gzippedBody.length);
    if ('HEAD' === req.method) res.end();
    else res.end(this.gzippedBody);
  } else {
    // res.setHeader('Content-Length', this.body.length);
    if ('HEAD' === req.method) res.end();
    else res.end(this.body);
  }
};

function Header(key, value) {
  this.key = key;
  this.value = value;
}
Header.prototype.set = function (res) {
  res.setHeader(this.key, this.value);
};

function md5(str) {
  return crypto.createHash('md5').update(str).digest("hex");
}

function supportsGzip(req) {
  return req.headers
      && req.headers['accept-encoding']
      && req.headers['accept-encoding'].indexOf('gzip') !== -1;
}
