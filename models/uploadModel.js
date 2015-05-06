var mongoose = require('mongoose'),
    SchemaNow = mongoose.Schema;
	
var uploadModel = new SchemaNow({
	filename: {type: String},
	originalname: {type: String},
	headers: {type: Object},
	folder: {type: String},
	description: {type: String},
	changes: {type: Object},
	logdate: {type: Date}
});

module.exports = mongoose.model('uploadlogs', uploadModel);