exports.connect = function(options, onconnect) {
	var socket = new TLSSocket(options);
	socket.on('connect', onconnect);
	return socket;
};

var stream = require('stream');
var inherits = require('inherits');
var forge = require('node-forge');

inherits(TLSSocket, stream.Duplex);

function TLSSocket(options) {
	var self = this;
	if (!(self instanceof TLSSocket))
		return new TLSSocket(options);

	stream.Duplex.call(self, options);

	self._socket = options.socket;

	// hacky fix to an unclear proble issue
	self.on('readable', function() {});

	self.readable = self.writable = false;

	self._host = options.host;
	if (options.ca) {
		self._ca = forge.pki.certificateFromPem(options.ca);
	} else {
		self._ca = false;
	}

	self._tls = forge.tls.createConnection({
		server: false,
		verify: function(connection, verified, depth, certs) {
			if (!(certs && certs[0])) {
				return false;
			}

			if (!verifyCertificate(certs[0], self._host)) {
				return false;
			}

			// without a pinned certificate, we'll just accept the connection and notify the upper layer
			if (!self._ca) {
				// succeed only if self.tlscert is implemented (otherwise forge catches the error)
				return true;
			}

			// if we have a pinned certificate, things get a little more complicated:
			// - leaf certificates pin the host directly, e.g. for self-signed certificates
			// - we also allow intermediate certificates, for providers that are able to sign their own certs.

			// detect if this is a certificate used for signing by testing if the common name different from the hostname.
			// also, an intermediate cert has no SANs, at least none that match the hostname.
			if (!verifyCertificate(self._ca, self._host)) {
				// verify certificate through a valid certificate chain
				return self._ca.verify(certs[0]);
			}

			// verify certificate through host certificate pinning
			var fpPinned = forge.pki.getPublicKeyFingerprint(self._ca.publicKey, {
				encoding: 'hex'
			});
			var fpRemote = forge.pki.getPublicKeyFingerprint(certs[0].publicKey, {
				encoding: 'hex'
			});

			// check if cert fingerprints match
			if (fpPinned === fpRemote) {
				return true;
			}

			// fail when fingerprint does not match
			return false;

		},
		connected: function(connection) {
			if (!connection) {
				self.emit('error');
				return;
			}

			// tls connection open
			self.writable = self.readable = true;
			if(connection.handshakes == 1) {         
				self.emit('connect');
			}
		},
		tlsDataReady: function(conn) {
			var bytes = conn.tlsData.getBytes();

			// send TLS data over socket
			self._socket.write(bytes, 'binary', function(err) {
			if (err) {
				self.emit('error', err);
			}
		  });
		},
		dataReady: function(conn) {
			// encrypted data received from the socket is decrypted
			var received = conn.data.getBytes();
			self.push(received);
		},
		closed: function() {
			self.emit('close');
		},
		error: function(connection, error) {
			self.emit('error', error);
		}
	});

	self._socket.on('data', function(chunk) {
	  self._tls.process(chunk.toString('binary'));
	});

	self._socket._onConnected(function() {
		self._tls.handshake();
	});
}

TLSSocket.prototype._read = function(buffer) {
	this._socket.read(buffer);
};

TLSSocket.prototype._write = function (buffer, encoding, callback) {
	var self = this;
	if (!callback)
		callback = function () {}

	if (!self.writable) {
		self.once('connect', function () {
			self._write(buffer, encoding, callback);
		})
		return
	}

	self._tls.prepare(buffer);
	callback();
};

TLSSocket.prototype.destroy = function (exception) {
	var self = this;
	return self._socket.destroy(exception);
};

// send all TCP socket calls to this._socket

Object.defineProperty(TLSSocket.prototype, 'bytesWritten', {
	get: function () {
		return this._socket.bytesWritten;
	}
});

TLSSocket.prototype.setTimeout = function (timeout, callback) {
	return this._socket.setTimeout(timeout, callback);
};

TLSSocket.prototype.setNoDelay = function (noDelay, callback) {
	return this._socket.setNoDelay(noDelay, callback);
};

TLSSocket.prototype.setKeepAlive = function (enable, initialDelay, callback) {
	return this._socket.setKeepAlive(enable, initialDelay, callback);
};

TLSSocket.prototype.address = function() {
	return this._socket.address();
};

TLSSocket.prototype.ref = function() {
	return this._socket.ref();
};

TLSSocket.prototype.unref = function() {
	return this._socket.unref();
};

/**
 * Verifies a host name by the Common Name or Subject Alternative Names
 *
 * @param {Object} cert A forge certificate object
 * @param {String} host The host name, e.g. imap.gmail.com
 * @return {Boolean} true, if host name matches certificate, otherwise false
 */
function verifyCertificate(cert, host) {
	var cn, cnRegex, subjectAltName, sanRegex;

	cn = cert.subject.getField('CN');
	if (cn && cn.value) {
		cnRegex = new RegExp(cn.value.replace(/\./g, '\\.').replace(/\*/g, '.*'), 'i');
		if (cnRegex.test(host)) {
			return true;
		}
	}

	subjectAltName = cert.getExtension({
		name: 'subjectAltName'
	});

	if (!(subjectAltName && subjectAltName.altNames)) {
		return false;
	}

	for (var i = subjectAltName.altNames.length - 1; i >= 0; i--) {
		if (subjectAltName.altNames[i] && subjectAltName.altNames[i].value) {
			sanRegex = new RegExp(subjectAltName.altNames[i].value.replace(/\./g, '\\.').replace(/\*/g, '.*'), 'i');
			if (sanRegex.test(host)) {
				return true;
			}
		}
	}

	return false;
}
