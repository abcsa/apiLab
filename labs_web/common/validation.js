'use strict';

let helper = require('./helper.js');
let _ = require('lodash');
let currentModule = 'validation.js';


exports.validateInput = function (inputName, obj, allowEmpty){

	let tempObj =  obj || '' ;
	
	switch(inputName){

		case 'string':
			return (obj === '' ? allowEmpty : _.isString(obj) );

		case 'user':
			return (_.isString(obj) && obj !== '');

		case 'mail':
			return helper.isEmail(obj);
		
		case 'number':
			return (obj === '' ? allowEmpty : helper.isNumeric(obj));
		
		case 'password':
			return (_.isString(obj) && obj !== '');
		
		case 'object':
			return true; // (obj === '' ? allowEmpty : _.isObject(obj) );
			
		case 'date':
			return true; //(obj === '' ? allowEmpty : _.isDate(obj) );
		
		case 'array':
			return true; //(_.isArray(obj));
			
		case 'location':
			return true; //(_.isArray(obj));
 
		default:
			helper.Log(null, currentModule, 'validateInput', 'Validating an UNKNOWN param "' + inputName +  '" (value "' + (tempObj || '') + '")');

	}

	throw new Error('Failed to pass ' + inputName + ' validation');
	
};
