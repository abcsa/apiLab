'use strict';

let chalk = require('chalk');
let _ = require('lodash');
let config = require('../common/config.js');
let db = require('../common/db.js');
let path = require('path');
let currentModule = 'helper.js';
let Binary = require('mongodb').Binary;
let ObjectId = require('mongodb').ObjectID;
let uuidParser = require('uuid-parse');
let crypto = require('crypto');
let jwt = require('jsonwebtoken');
let fs = require('fs');
let uuidGenerator = require('uuid/v4');

const SIMPLE_DATE = /^(19|20)\d\d[- /.](0[1-9]|1[012])[- /.](0[1-9]|[12][0-9]|3[01])$/;
const AJAX_DATE = /^\/Date\((d|-|.*)\)[/|\\]$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.{0,1}\d*))(?:Z|(\+|-)([\d|:]*))?$/;
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const UUID_FAKE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MONGO_OBJECTID = /^[0-9a-f]{24}$/i;
const EMAIL = /^[\w-.++]+@([\w-]+\.)+[\w-]{2,4}$/;
const UPPER_CASE_PATTERN =  /[A-Z]/;
const NUMBER_PATTERN = /[0-9]/;
const LOWER_CASE_PATTERN =  /[a-z]/;


function _newUUID (preferedId){
	if(preferedId){
		_Log(null, currentModule, '_newUUID', 'User requested a preferedId, but we can not help him at this point.');
	}
   return uuidGenerator();
}

function _padLeft (str, offSet){
	return _.truncate(_.padEnd('' + str, offSet), {'length': offSet});
}

function _posDatabase (json){
	
	for (let k in json) {
		
		let obj = json[k];
		
		if (_.isArray(obj)) {
			obj = _posDatabase(obj);
		}
		
		if (_.isPlainObject(obj)) {
			obj = _posDatabase(obj);
		}
		
		if (_.isDate(obj)) {
			obj = new Date(obj);
		}
		
		if (_.isObject(obj)) {
			
			if (obj instanceof Binary && obj.sub_type === Binary.SUBTYPE_UUID) {
				obj = uuidParser.unparse(obj.buffer);
			}
			
			if (obj instanceof ObjectId) {
				obj = obj.toHexString();
			}
			
		}
		
		json[k] = obj;
		
	}
	
	return json;
	
}

function _preDatabase (json){
	
	for (let k in json) {
		
		let obj = json[k];
		
		if (_isArray(obj)) {
			obj = _preDatabase(obj);
		}
		
		if (_.isPlainObject(obj)) {
			obj = _preDatabase(obj);
		}
		
		if (_.isObject(obj) && obj._isAMomentObject) {
			obj = new Date(obj.toDate());
		}
		
		if (_.isString(obj)) {
			
			if (_isISODate(obj)) {
				obj = new Date(new Date(obj));
			}
			
			if (_isSimpleDate(obj)) {
				obj = new Date(new Date(obj));
			}
			
			if (_isAjaxDate(obj)) {
				let dt = AJAX_DATE.exec(obj)[1].split(/[-+,.]/);
				obj = new Date(new Date(dt[0] ? +dt[0] : 0 - +dt[1]));
			}
			
			if (_isV4UUID(obj)) {
				obj = Binary(new Buffer(uuidParser.parse(obj)), Binary.SUBTYPE_UUID);
			}
			
			if (_isFakeUUID(obj)) {
				obj = Binary(new Buffer(uuidParser.parse(obj)), Binary.SUBTYPE_UUID);
			}
			
			if (_isMongoObjectId(obj)) {
				obj = new ObjectId(obj);
			}
		}
		
		json[k] = obj;
		
	}
	
	return json;
	
}

function _addURLs (json, path){
	
	if(!path){
		path = '';
	}
	
	for (let k in json) {
		
		let name = k;
		let value = json[name];
		
		if( name === 'users' ||  name === 'audits'){
			path = name;
		}
		
		if (_isArray(value)) {
			value = _addURLs(value, path);
		}
		
		if (_.isPlainObject(value)) {
			value = _addURLs(value, path);
		}

		if (name === '_id' & path !== ''){
			json.url = config.url.base + '/' + path + '/' + value ;
			_Log(null, currentModule, '_getCurrentDateString', '   URL: ' + json.url + '"');
		}
		
	}
	
	return json;
 
}

function _isArray (variable){
	return (_.isArray(variable));
}

function _isISODate (variable){
	return (ISO_DATE.exec(variable));
}

function _isSimpleDate (variable){
	return (SIMPLE_DATE.exec(variable));
}

function _isAjaxDate (variable){
	return (AJAX_DATE.exec(variable));
}

function _isV4UUID (variable){
	return (UUID_V4.exec(variable));
}

function _isFakeUUID (variable){
	return (UUID_FAKE.exec(variable));
}

function _isMongoObjectId (variable){
	return (MONGO_OBJECTID.exec(variable));
}

function _isNumeric (x) {
	return parseFloat(x).toString() === x.toString();
}

function _isEmail (x){
	return EMAIL.exec(x);
}

function _isObject (x){
	return _.isObject(x);
}

function _convertStringToUUID (string){
	return Binary(new Buffer(uuidParser.parse(string)), Binary.SUBTYPE_UUID);
}

function _getCodeFromLogin (login, acting){

	let code = login;
	
	// Does the user have "@" but have no "period"
	if(code.indexOf('@') > -1 && code.indexOf('.') === -1) {
		
		let users = code.split('@');
		
		if (acting){
			code = users[1];
		}else{
			code = users[0];
		}
	}
	
	if(code.length === 9 && _isNumeric(code)){
		_Log(null, currentModule, 'getCodeFromLogin', 'Adding a leading zero before the user code "' + code + '".');
		code = '0' + code;
	}
	
	return code.trim();
}

const EVENTS =  {
	server:   {
		started:  'server.started',
		error: 	  'server.error'
	},
	audits: {
		TBF: 	'TBF',
		REDUX: 	'REDUX',
		create:	'audit.create',
		read: 	'audit.read',
		list:   'audit.list',
	},
	services: {
		import: {
			started: 	'services.import.started',
			finished: 	'services.import.finished',
			file: 	    'services.import.file',
			record: {
				volume: 		'services.import.record.volume',
				quality: 		'services.import.record.quality',
				price: 			'services.import.record.price',
				user: 			'services.import.record.user',
				farm: 			'services.import.record.farm',
				demo: 			'services.import.record.demo',
				in62: 			'services.import.record.in62',
				simulador: 		'services.import.record.simulador',
				minPrice: 		'services.import.record.minPrice',
				reportIncome: 	'services.import.record.reportIncome',
				parameters: 	'services.import.record.parameters',
			},
			
		},
		export: {
			started: 		'services.export.started',
			finished: 		'services.export.finished',
			notifications:  'services.export.notifications',
			checklists:		'services.export.checklists',
			deactivations:	'services.export.deactivations',
		},
		expire: {
			started: 	'services.expire.started',
			finished: 	'services.expire.finished',
			item: 		'services.expire.item'
		} ,
		cleanup: {
			started: 	'services.cleanup.started',
			finished: 	'services.cleanup.finished',
			item: 		'services.cleanup.item'
		},
	},
	invites: {
		create: 'invites.create',
		read: 	'invites.read',
		update: 'invites.update',
		delete: 'invites.delete',
		list:   'invites.list',
		accept: 'invites.accept'
	},
	users: {
		create: 			'users.create',
		read: 				'users.read',
		update: 			'users.update',
		delete: 			'users.delete',
		list: 				'users.list',
		authenticate: 		'users.authenticate',
		signup: 			'users.signup',
		validate: 			'users.validate',
		activate: 			'users.activate',
		deactivate: 		'users.deactivate',
		expirePassword:     'users.expirePassword',
		recoverPassword: 	'users.recoverPassword',
		resetPassword: 		'users.resetPassword'
	},
	properties: {
		create: 'properties.create',
		read: 	'properties.read',
		update: 'properties.update',
		delete: 'properties.delete',
		list:   'properties.list',
	},
	checklists: {
		create: 'checklists.create',
		read: 	'checklists.read',
		update: 'checklists.update',
		delete: 'checklists.delete',
		list:   'checklists.list',
	},
	checklistResults: {
		create: 'checklistResults.create',
		read: 	'checklistResults.read',
		update: 'checklistResults.update',
		delete: 'checklistResults.delete',
		list:   'checklistResults.list',
	},
	templates: {
		create: 'templates.create',
		read: 	'templates.read',
		update: 'templates.update',
		delete: 'templates.delete',
		list:   'templates.list',
	},
	notifications: {
		create: 			'notifications.create',
		read: 				'notifications.read',
		update:	 			'notifications.update',
		delete: 			'notifications.delete',
		list:   			'notifications.list',
		sendMail:			'notifications.sendMail',
		sendNotification: 	'notifications.sendNotification',
	},
	schedules: {
		create: 'schedules.create',
		read: 	'schedules.read',
		update: 'schedules.update',
		delete: 'schedules.delete',
		list:   'schedules.list',
	},
	tasks: {
		create: 'tasks.create',
		read: 	'tasks.read',
		update: 'tasks.update',
		delete: 'tasks.delete',
		list:   'tasks.list',
	},
	files: {
		create: 'files.create',
		read: 	'files.read'
	},
	contents: {
		create: 'contents.create',
		read: 	'contents.read',
		update: 'contents.update',
		delete: 'contents.delete',
		list:   'contents.list',
	},
};

function _audit (req, resource, data){
	
	let err;
	if (data instanceof Error){
		err = data;
		data = null;
	}
	
	if(!resource){
		_Log(null, currentModule, 'audit', 'Error handling resource name.');
		resource =  EVENTS.server.error;
	}
	
	try {
		let remoteIP;
		let code;
		let impersonatedFrom;
		
		if(req){
			if (req.headers){
				remoteIP = req.headers.remoteIP;
			}
			
			if(req.resources){
				let user = _.get(req.resources, 'authUser');
				if (user && user.user){
					code = user.user;
					if (user.impersonatedFrom){
						impersonatedFrom = user.impersonatedFrom;
					}
				}
			}
		}
		
		if(!code) {
			if (data && data.code) {
				code = data.code;
			}
		}
		
		if(!code) {
			if (data && data.user) {
				code = data.user;
			}
		}
 
		let val = {
			source: config.app.name,
			name: resource,
			remoteIP: remoteIP,
			code: code,
			insertedAt: _getCurrentDateString(),
		};
		
		if(data){
			let buf = JSON.stringify(data).replace(/\$/gi, '_');
			val.data = JSON.parse(buf);  //Make sure we send a copy of the data, not the original object.;
		}
		
		if(remoteIP){
			val.remoteIP = remoteIP;
		}
		
		if (impersonatedFrom){
			val.impersonatedFrom = impersonatedFrom;
		}
		
		if(err){
			val.error = err;
		}
		
		//removes unused values (nulls and undefined)
		val = _.omitBy(val, _.isNil);
 
		return db.collection('audits').insert(val)
			.then(function (ret) {
				return Promise.resolve({_id: ret.lastErrorObject.upserted || ''});
			})
			.catch(function (ex){
				_Log(null, currentModule, 'audit', 'Failed to Audit: ' + ex);
				return Promise.reject(ex);
			});
		
	} catch (ex) {
		_Log(null, currentModule, 'audit', 'Failed to insert audit item: ' + ex);
	}
	
}

function _reduce (obj, keys){
	
	if(_.isArray(obj)){
		return _.map(obj, _.partial(_.pick, _, keys));
	}else{
		return _.pick(obj, keys);
	}
	
}

function _translate (original, language){

	if (!language) {
		//Assumes portuguese
		switch (original){
			case 'OK':  					return 'OK';
			case 'Created':  				return 'Criado';
			case 'Accepted':  				return 'Aceito';
			case 'No Content':  			return 'Não há conteúdo';
			case 'Moved Permanently':  		return 'Mudou-se permanentemente';
			case 'Found':  					return 'Encontrado';
			case 'See Other':  				return 'Veja outro';
			case 'Not Modified':  			return 'Não modificado';
			case 'Temporary Redirect':  	return 'Redirecionado temporariamente';
			case 'Bad Request':  			return 'Requisição inválida';
			case 'Forbidden':  				return 'Proibido';
			case 'Resource not found':  	return 'Recurso não encontrado';
			case 'Method Not Allowed':  	return 'Método não permitido';
			case 'Not Acceptable':  		return 'Não aceitável';
			case 'Resource is gone':  		return 'Recurso não existe';
			case 'Precondition Failed':  	return 'Falha em uma pré-condição';
			case 'Unsupported Media Type':  return 'Tipo de midia não suportado';
			case 'Internal Server Error':  	return 'Erro interno no servidor';
			case 'Not Implemented':  		return 'Não implementado';
			case 'Unauthorized': 			return 'Não autorizado';
			//------------------------------------------------------------------------------------------------
			case 'Wrong user or password': 							    return 'Usuário ou Senha inválidos';
			case 'User and password are required': 						return 'Usuário e Senha são obrigatórios';
			case 'A user code is required': 							return 'O código do usuário é obrigatório';
			case 'An resetPassword token is required': 					return 'O token de recuperação de senha é obrigatório';
			case 'This is not a valid resetPassword token': 			return 'O token de recuperação de senha é inválido';
			case 'Client authentication failed': 						return 'A autenticação do cliente falhou';
			case 'An access token is required': 						return 'O token de acesso e obrigatório';
			case 'Unable to locate current user data': 					return 'Falha ao carregar dados do usuário';
			case 'Unable to locate current user token': 				return 'Falha ao identificar o token';
			case 'Failed to cancel previous invites': 					return 'Falha ao cancelar convites anteriores';
			case 'Failed to check previously accepted invites': 		return 'Falha ao verificar se um convite anterior já foi aceito';
			case 'Failed to create new invite': 						return 'Falha ao criar um novo convite';
			case 'Password is required': 								return 'A Senha é obrigatória';
			case 'Password does not meet security requirements': 		return 'A Senha não atende aos requisitos de segurança';
			case 'You do not have permissions to list this resource': 	return 'Você não tem permissão para listar este recurso';
			case 'You do not have permissions to create this resource': return 'Você não tem permissão para criar este recurso';
			
			case 'Not answered': 										return 'Não respondido';
			case 'Image not found': 									return 'Imagem não encontrada';
			case 'Login should be a code not an email address': 		return 'O usuário deve ser um código e não um endereço de email';
			//case '': 			return '';
			//case '': 			return '';
			case 'User has no password':								return "O usuário não cadastrou nenhuma senha anteriormente";
			case 'New password cannot be equal old password.' :         return "A nova senha não pode ser igual a senha cadastrada anteriormente.";
			default: 						return original;
		}
	}
	
}

let _REST = {
	ok: function (obj) {
		return {
			//status: '200',
			//type: 'Success',
			//message: 'OK',
			//userMessage: _translate('OK'),
			source: config.app.title,
			result: obj,
			createdAt: _getCurrentDateString()
		};
	},
	created: function (extra) {
		return {
			status: '201',
			type: 'Success',
			message: 'Created',
			userMessage: _translate('Created') + (extra ? ': ' + _translate(extra) : '') + '.',
			source: config.app.title,
			createdAt: _getCurrentDateString()
		};
	},
	accepted: function (extra) {
		return {
			status: '202',
			type: 'Success',
			message: 'Accepted',
			userMessage: _translate('Accepted') + (extra ? ': ' + _translate(extra) : '') + '.',
			source: config.app.title,
			createdAt: _getCurrentDateString()
		};
	},
	noContent: function (source, extra) {
		return {
			status: '204',
			type: 'Success',
			message: 'No Content',
			userMessage: _translate('No Content') + (extra ? ': ' + _translate(extra) : '') + '.',
			source: config.app.title,
			createdAt: _getCurrentDateString()
		};
	},
	badRequest: function (module, procedure, extra) {
		return {
			status: '400',
			type: 'Client Error',
			message: 'Bad Request',
			userMessage: _translate('Bad Request') + (extra ? ': ' + _translate(extra) : '') + '.',
			module: module,
			source: procedure,
			createdAt: _getCurrentDateString()
		};
	},
	unauthorized: function (module, procedure, extra) {
		if(!extra){
			extra = 'Authentication is required and has failed or has not yet been provided';
		}
		return {
			status: '401',
			type: 'Client Error',
			message: 'Unauthorized',
			userMessage: _translate('Unauthorized') + (extra ? ': ' + _translate(extra) : '') + '.',
			module: module,
			source: procedure,
			createdAt: _getCurrentDateString()
		};
	},
	forbidden: function (module, procedure, extra) {
		if(!extra){
			extra = 'Request is valid, but the server is refusing it because the user might not have the necessary permissions';
		}
		return {
			status: '403',
			type: 'Client Error',
			message: 'Forbidden',
			userMessage: _translate('Forbidden') + (extra ? ': ' + _translate(extra) : '') + '.',
			module: module,
			source: procedure,
			createdAt: _getCurrentDateString()
		};
	},
	notFound: function (module, procedure, extra) {
		return {
			status: '404',
			type: 'Client Error',
			message: 'Not Found',
			userMessage: _translate('Resource not found') + (extra ? ': ' + _translate(extra) : '') + '.',
			module: module,
			source: procedure,
			createdAt: _getCurrentDateString()
		};
	},
	preconditionFailed: function (module, procedure, extra) {
		return {
			status: '412',
			type: 'Client Error',
			message: 'Precondition Failed',
			userMessage: _translate('Precondition Failed') + (extra ? ': ' + _translate(extra) : '') + '.',
			module: module,
			source: procedure,
			createdAt: _getCurrentDateString()
		};
	},
	unsupportedMediaType: function (module, procedure, extra) {
		return {
			status: '415',
			type: 'Client Error',
			message: 'Unsupported Media Type',
			userMessage: _translate('Unsupported Media Type') + (extra ? ': ' + _translate(extra) : '') + '.',
			module: module,
			source: procedure,
			createdAt: _getCurrentDateString()
		};
	},
	internalServerError: function (module, procedure, extra) {
		return {
			status: '500',
			type: 'Server Error',
			message: 'Internal Server Error',
			userMessage: _translate('Internal Server Error') + (extra ? ': ' + _translate(extra) : '') + '.',
			module: module,
			source: procedure,
			createdAt: _getCurrentDateString()
		};
	},
	notImplemented: function (module, procedure, extra) {
		return {
			status: '501',
			type: 'Server Error',
			message: 'Not Implemented',
			userMessage: _translate('Not Implemented') + (extra ? ': ' + _translate(extra) : '') + '.',
			module: module,
			source: procedure,
			createdAt: _getCurrentDateString()
		};
	}
};

function _encodeJWT (payload){
	return jwt.sign(payload, config.token.password, {algorithm: config.token.algorithm});
}

function _createJWTPayload (subject, audience, customData, expiration){
	

	
	let now = new Date();
	
	let ret = {
		jti: _newUUID(),
		iss: config.app.title,
		sub: subject,
		aud: audience,
		iat: Math.floor(now / 1000),
		exp: Math.floor(now / 1000 + (expiration || config.authentication.minutesToExpire) * 60),
		data: customData,
	};
	
	//_Log(null, currentModule, '_createJWTPayload', 'iat=' + ret.iat + ', exp=' + ret.exp + ', dif=' + (ret.exp - ret.iat) + '');
	
	return ret;
	
}

function _decodeJWT (token){
	
	return new Promise (function (resolve, reject) {
		try{
			let result;
			if(config.token.password){
				result = jwt.verify(token, config.token.password);
			}else{
				result = jwt.decode(token);
			}
			return resolve(result);
		}catch(ex){
			return reject(ex);
		}
	});
	
	//let result;
	//try{
	//	if(config.token.password){
	//		result = jwt.verify(token, config.token.password);
	//	}else{
	//		result = jwt.decode(token);
	//	}
    //
	//}catch(ex){
	//	_Log(null, currentModule, 'decodeJWT', ex.message);
	//	//athrow ex;
	//}
	
}

function _isPasswordValidEmployee (password){
	
	if(!password){
		_Log(null, currentModule, 'isPasswordValid', 'A Senha não foi informada!');
		return false;
	}
	
	if (password.length < 16 || password.length > 20){
		_Log(null, currentModule, 'isPasswordValid', 'A Senha precisa ter entre 10 e 20 dígitos!');
		return false;
	}
	
	if (!UPPER_CASE_PATTERN.test(password)) {
		_Log(null, currentModule, 'isPasswordValid', 'A Senha precisa ter pelo menos uma letra maiúscula!');
		return false;
	}

	if (!NUMBER_PATTERN.test(password)) {
		_Log(null, currentModule, 'isPasswordValid', 'A Senha precisa ter pelo menos um número!');
		return false;
	}

	if (!LOWER_CASE_PATTERN.test(password)) {
		_Log(null, currentModule, 'isPasswordValid', 'A Senha precisa ter pelo menos uma letra minúscula!');
		return false;
	}

	return true;
	
}

function _isPasswordValidProducer (password){

	if(!password){
		_Log(null, currentModule, 'isPasswordValid', 'A Senha não foi informada!');
		return false;
	}

	if (password.length < 6 || password.length > 20){
		_Log(null, currentModule, 'isPasswordValid', 'A Senha precisa ter entre 10 e 20 dígitos!');
		return false;
	}

	if (!UPPER_CASE_PATTERN.test(password)) {
		_Log(null, currentModule, 'isPasswordValid', 'A Senha precisa ter pelo menos uma letra maiúscula!');
		return false;
	}

	if (!NUMBER_PATTERN.test(password)) {
		_Log(null, currentModule, 'isPasswordValid', 'A Senha precisa ter pelo menos um número!');
		return false;
	}

	if (!LOWER_CASE_PATTERN.test(password)) {
		_Log(null, currentModule, 'isPasswordValid', 'A Senha precisa ter pelo menos uma letra minúscula!');
		return false;
	}

	return true;

}

function _getBasicCredentials (basicAuthentication){
	
	if (basicAuthentication){
		
		let authData = basicAuthentication.trim();
		
		if (_.startsWith(authData.toLowerCase(), 'basic')) {
			authData = (authData || '').split(' ')[1] || '';
		}
		
		authData = new Buffer(authData, 'base64').toString();
		
		let sepIndex = authData.indexOf(':');
		return [authData.substring(0, sepIndex), _cipherPlainText(authData.substring(sepIndex + 1))];
	}
	
	return [];
}

function _cipherPlainText (plainText) {
	let cipher = crypto.createCipher(config.crypto.algorithm, config.crypto.password);
	let cipheredText = cipher.update(plainText, 'utf8', 'hex');
	cipheredText += cipher.final('hex');
	return cipheredText;
}

function _decipherCipheredText (cipheredText) {
	let decipher = crypto.createDecipher(config.crypto.algorithm, config.crypto.password);
	let plainText = decipher.update(cipheredText, 'hex', 'utf8');
	plainText += decipher.final('utf8');
	return plainText;
}

function _getCurrentDateString () {

	return new Date().toISOString();

}

function _convertChecklistLinkToDeepLink(url){
	
	let index = url.indexOf('&id=');
	
	if (index >= 0){
		return 'leiteria://checklist/' + url.substr(index + 4, 36);
	}

	return '';
}

/*
if (returnLocalTime){
	temp = _UTCtoLocalTime(temp);
}

if (returnBrazilianFormat){
	ret1 = _formatBrazilianDate(temp) + ' ' + _formatHour(temp);
}else{
	ret1 = temp.toISOString();
}

if (!date) {
	let d = now;
	temp = d.toISOString();
}else{
	let d = new Date(date);
	temp = d.toISOString();
}

if (returnLocalTime){
	temp = _UTCtoLocalTime(temp).toISOString();
}

if (returnBrazilianFormat){
	temp = _formatBrazilianDate(temp) + ' ' + _formatHour(temp);
}

ret2 = temp;

if (ret1 !== ret2){
	_Log(null, currentModule, '_getCurrentDateString', 'EEEEPA....Converting "' + date + '" resulted in ret1: "' + ret1 + '" and ret2: "' + ret2 + '"..');
}
*/

function _formatHour (datetime, returnMiliseconds){
	
	let h = new Date(datetime);
	let ret;
	
	let miliseconds = '' + (h.getMilliseconds());
	if (miliseconds.length < 3) {
		miliseconds = '00' + miliseconds;
	}
	if (miliseconds.length < 2) {
		miliseconds = '0' + miliseconds;
	}
	
	let seconds = '' + (h.getSeconds());
	if (seconds.length < 2) {
		seconds = '0' + seconds;
	}
	
	let minutes = '' + h.getMinutes();
	if (minutes.length < 2) {
		minutes = '0' + minutes;
	}
	
	let hours = h.getHours();
	if (hours.length < 2) {
		hours = '0' + hours;
	}
	
	ret = hours + ':' + minutes + ':' + seconds;
	
	if (returnMiliseconds) {
		ret = ret + ' ' + miliseconds;
	}

	return ret;
	
}

function _isValidDate(d) {
	return d instanceof Date && !isNaN(d);
}

function _formatBrazilianDate (date, returnTime) {

	let d = new Date(date);
	
	if(!_isValidDate(d)) {
		
		// "finishedAt" : "23/05/2019 10:34:41",
		let _d = parseInt(date.substr(0,2));
		let _m = parseInt(date.substr(3,2)) - 1; //java month is zero based
		let _y = parseInt(date.substr(6,4));
		let _h = parseInt(date.substr(11,2));
		let _n = parseInt(date.substr(14,2));
		let _s = parseInt(date.substr(17,2));
		
		d = new Date(_y, _m, _d, _h, _n, _s);
		
	}
	
	if(_isValidDate(d)){
		let month = '' + (d.getMonth() + 1);
		if (month.length < 2) {
			month = '0' + month;
		}
		
		let day = '' + d.getDate();
		if (day.length < 2) {
			day = '0' + day;
		}
		
		let year = d.getFullYear();
		
		if(returnTime){
			return day + '/' + month + '/' + year + ' ' + _formatHour(d, false);
		}else{
			return day + '/' + month + '/' + year;
		}
	}

	return date + '*' ;

}

function _convertToLocal (UTCDate){

	try{
		let options = {
			timeZone: "America/Sao_Paulo",
			year: 'numeric', month: 'numeric', day: 'numeric',
			hour: 'numeric', minute: 'numeric', second: 'numeric'
		};
		
		let formatter = new Intl.DateTimeFormat([], options);

		let localDate = formatter.format(new Date(UTCDate));

		//let utcDate = new Date(UTCDate);
		//let utcOffset = utcDate.getTimezoneOffset();
		//let localDate = new Date(utcDate.getTime() - (utcOffset * 60 * 1000) );

		_Log(null, currentModule, '_convertToLocal', 'Converted UTC "' + UTCDate + '" to ' + options.timeZone + ' "' + localDate + '".');
		
		return localDate;
		
	}catch(ex){
		_Log(null, currentModule, '_convertToLocal', '   Error converting UTC date "' + UTCDate + '" to local:' + ex);
		return UTCDate;
	}
 
}

function _getElapsedTime (fromTime) {
	
	const SECONDS_IN_MINUTE = 60;
	const SECONDS_IN_HOUR = SECONDS_IN_MINUTE * 60;
	//const SECONDS_IN_DAY = SECONDS_IN_HOUR * 24;
	
	let timeDiff = Math.abs(new Date().getTime() - fromTime.getTime());
	
	let seconds = Math.floor(timeDiff / 1000);

	let hours = Math.floor(seconds / SECONDS_IN_HOUR);
	seconds = seconds - hours * SECONDS_IN_HOUR;
	
	let minutes = Math.floor(seconds / SECONDS_IN_MINUTE);
	seconds = seconds - minutes * SECONDS_IN_MINUTE;
	
	return (hours > 0 ? hours + 'h ' : '') + (minutes > 0 ? minutes + 'm ' : '') + seconds + 's';

}

function _hasPermission (token, resourceName, factoryCode) {
	
	//TODO: Check permissions from db, not from informed token.

	if(token && token.data){
		
		//Check by resource name
		if(resourceName && token.data.permissions && token.data.permissions.indexOf(resourceName) !== -1){
			return true;
		}
		
		//Check by factory
		if(factoryCode && token.data.factories && token.data.factories.indexOf('' + factoryCode + '') !== -1){
			return true;
		}
		
	}else{
		return false;
	}
	
}

function _mkdirRecursiveSync (path) {

	let folders = path.split('/');
	let fullPath = '';
	let log = false;
	
	folders.forEach(function (folder){
		if(folder !== ''){
			fullPath += '/' + folder;
			
			if(log) {
				_Log(null, currentModule, 'mkdirRecursiveSync', 'Checking if folder "' + fullPath + '" exists...');
			}
			
			if (!fs.existsSync(fullPath) && fullPath !== '') {
				if(log) {
					_Log(null, currentModule, 'mkdirRecursiveSync', 'Creating folder "' + fullPath + '"...');
				}
				fs.mkdirSync(fullPath);
			}
		}
	});
	
	if (fs.existsSync(path)) {
		if(log) {
			_Log(null, currentModule, 'mkdirRecursiveSync', 'Folder "' + path + '" exists.');
		}
	}else{
		_Log(null, currentModule, 'mkdirRecursiveSync', 'Failed to create folder "' + fullPath + '"!');
	}

}

function _deleteFilesFromFolder (path, extension) {
	
	let log = false;
	
	if (log){
		_Log(null, currentModule, '_deleteFilesFromFolder', 'Deleting files ' + (extension ? '': '(' + extension + ') ') + 'from folder "' + path + '"...');
	}
	
	let files = fs.readdirSync(path);
	
	if (log) {
		_Log(null, currentModule, '_deleteFilesFromFolder', '   Found ' + files.length + ' files on folder:');
	}
	
	for (const file of files) {
		try{
			if(!extension || file.indexOf(extension) > -1) {
				
				fs.unlinkSync(path + '/' + file);
				
				if (log) {
					_Log(null, currentModule, '_deleteFilesFromFolder', '      Deleted File "' + file + '".');
				}
			}else{
				if (log) {
					_Log(null, currentModule, '_deleteFilesFromFolder', '      File "' + file + '" ignored because it is not "' + extension + '"!');
				}
			}
		}catch(ex){
			_Log(null, currentModule, '_deleteFilesFromFolder', 'Error deleting file  "' + file + '": ' + ex);
		}
	}

}

function _LogJSON (module, procedure, obj, ident) {
	
	let s = '';
	
	JSON.stringify(obj, function (key, value) {

		if (_.isPlainObject(value)) {
			_Log(null, currentModule, 'LogJSON', _.padStart('', ident) + (key !== ''? key + ': ' : '') + '{');
			s = s + (key !== ''? key + '.' : '') ;
			ident = ident + 3;
			return value;
		}else{
			if (s !== ''){
				_Log(null, currentModule, 'LogJSON', _.padStart('', ident) + s + ' {');
				s = '';
			}
			_Log(null, currentModule, 'LogJSON', _.padStart('', ident) + key + ': ' + value);
		}
 
	}, ident);

}

function _maskEmailAddress (email){
	let token = email.split('@');
	let size = token[0].length - 2;
	return token[0].substr(0, 1) + '*'.repeat(size) + token[0].substr(size+1, 1) + '@' + token[1];
}

function _isVersionOlder (currentVersion, suggestedVersion){
	
	let token = '';
	let current = 0;
	let suggested = 0;
	
	if(!currentVersion || currentVersion === null && currentVersion === '') {
		currentVersion = '0.0.0';
	}
	
	if (suggestedVersion && suggestedVersion !== null && suggestedVersion !== '') {
		
		//consider numbers only
		token = currentVersion.replace(/[^\d.]/g, '').split('.');
		current = _.padStart(token[0], 3, '0') + _.padStart(token[1], 3, '0') + _.padStart(token[2], 3, '0');
		
		token = suggestedVersion.replace(/[^\d.]/g, '').split('.');
		suggested = _.padStart(token[0], 3, '0') + _.padStart(token[1], 3, '0') + _.padStart(token[2], 3, '0');
	}
	
	return (current < suggested);
}

module.exports.padLeft = _padLeft;
module.exports.Log = _Log;
module.exports.LogJSON = _LogJSON;
module.exports.EVENTS = EVENTS;
module.exports.audit = _audit;

module.exports.getCurrentDateString = _getCurrentDateString;
module.exports.convertToLocal = _convertToLocal;
module.exports.formatBrazilianDate = _formatBrazilianDate;
module.exports.getElapsedTime = _getElapsedTime;

module.exports.preDatabase = _preDatabase;
module.exports.posDatabase = _posDatabase;
module.exports.reduce = _reduce;
module.exports.REST = _REST;
module.exports.translate = _translate;
module.exports.encodeJWT = _encodeJWT;
module.exports.createJWTPayload = _createJWTPayload;
module.exports.decodeJWT = _decodeJWT;
module.exports.cipherPlainText = _cipherPlainText;
module.exports.decipherCipheredText = _decipherCipheredText;
module.exports.getBasicCredentials = _getBasicCredentials;
module.exports.hasPermission = _hasPermission;
module.exports.mkdirRecursiveSync = _mkdirRecursiveSync;
module.exports.getCodeFromLogin = _getCodeFromLogin;

module.exports.isNumeric = _isNumeric;
module.exports.isEmail = _isEmail;
module.exports.isPasswordValidEmployee = _isPasswordValidEmployee;
module.exports.isPasswordValidProducer = _isPasswordValidProducer;
module.exports.isArray = _isArray;
module.exports.isISODate =_isISODate;
module.exports.isSimpleDate =_isSimpleDate;
module.exports.isAjaxDated =_isAjaxDate;
module.exports.isV4UUID =_isV4UUID;
module.exports.isFakeUUID =_isFakeUUID;
module.exports.isMongoObjectId =_isMongoObjectId;

module.exports.deleteFilesFromFolder = _deleteFilesFromFolder;
module.exports.convertStringToUUID = _convertStringToUUID;
module.exports.maskEmailAddress = _maskEmailAddress;
module.exports.addURLs = _addURLs;
module.exports.newUUID = _newUUID;
module.exports.isVersionOlder = _isVersionOlder;
module.exports.isObject = _isObject;
module.exports.convertChecklistLinkToDeepLink = _convertChecklistLinkToDeepLink;