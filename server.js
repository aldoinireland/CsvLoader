var fs = require("fs"),
    mongoose = require("mongoose"),
    Schema = mongoose.Schema,
    csv = require("fast-csv"),
    walk = require('walk'),
    uploadModel = require('./models/uploadModel'),
    admzip = require('adm-zip'),
    log4js = require('log4js'),
    mkdirp = require('mkdirp'),
    hasher = require("./data/hasher"),
    diff = require('deep-diff').diff;

var fileSchema = new Schema({}, {
    strict: false
});

log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('app.log'), 'applog');
var logger = log4js.getLogger('applog');

var runId = hasher.createSalt();
logger.info('Application started with id:' + runId);

var databaseRetry = [];
var writeComplete = [];

var parseFilePath = function(filepath, inputs) {
    var pathArray = filepath.split("/");
    for (var i = 0; i < inputs.length; i++) {
        if (inputs[i].INPUT == pathArray[2]) {
            logger.info(runId + ": Input type verified from file path successfully for " + pathArray[2]);
            return pathArray[2];
        }
    }
};
var fileManagement = function(currentFileName, newFilename, inputType, callback) {
    var _currentFileName = currentFileName;
    var _newFileName = newFilename;
    fs.rename("./input/" + inputType + "/" + _currentFileName, "./archive/" + inputType + "/" + _newFileName, function(err, result) {
        if (!err) {
            var zip = new admzip();
            zip.addLocalFile("./archive/" + inputType + "/" + _newFileName);
            zip.writeZip("./archive/" + inputType + "/" + _newFileName + ".zip", function(err, result) {
                if (!err) {
                    fs.unlink("./archive/" + inputType + "/" + _newFileName, function(err) {
                        if (err) throw err;
                        callback();
                    });
                }
            });
        }
        else {
            logger.error(runId + ": " + newFilename + " failed to compress");
        }
    });
};
var logUpload = function(header, inputType, currentFileName, newFilename, callback) {
    uploadModel = require('./models/uploadModel');
    uploadModel.findOne({inputtype: inputType}, {}, {
        sort: {
            'created_at': -1
        }
    }, function(err, post) {
        if (!err) {

            var diff = require('deep-diff').diff;

            if (post) {
                var oldHeaders = post._doc.headers;
            }
            else {
                oldHeaders = [];
            }
            
            var differences = diff(oldHeaders, header);

            var upload = new uploadModel();
            upload.headers = header;
            upload.originalname = currentFileName;
            upload.filename = newFilename;
            upload.logdate = new Date();
            upload.folder = "input";
            upload.inputtype = inputType;
            upload.changes = differences;
            upload.save(function(err, result) {
                if (!err) {
                    logger.info(runId + ": Successfully logged file processed for " + currentFileName);
                    callback(currentFileName, newFilename);
                }
            });
        }
    });
};
var writeInputs = function(inputType, stream, currentFileName, inputs, callback) {
    var header = [];
    var _inputType = inputType;
    csv
        .fromStream(stream, {
            headers: true
        })
        .on("data", function(data) {

            var saveInput = mongoose.model(inputType, fileSchema);
            var entry = new saveInput(data);
            entry.save(function(err, data) {
                if (err) {
                    logger.error(runId = ": Failed to save input to database");
                }
            });

            if (header.length == 0) {
                for (var name in data) {
                    header.push(name);
                }
            }
        }).on("end", function() {
            logger.info(runId + ": Data successfully saved to database for file " + currentFileName + " in Schema " + inputType);
            var newFilename = hasher.createSalt() + '.' + currentFileName.split('.').pop();
            logUpload(header, _inputType, currentFileName, newFilename,  function(currentFileName, newFilename) {
                fileManagement(currentFileName, newFilename, _inputType, function(){
                    writeComplete.push(1);
                    callback();
                });
            });
            
        });
};
var connectToDatabase = function(callback) {
    mongoose.connect('mongodb://xxxx:xxxx@ds062807.mongolab.com:62807/calldata', function(err) {
        if (err) {
            if (databaseRetry.length != 5) {
                databaseRetry.push("R");
                logger.warn(runId + ": Failed to connect to database: retry number " + databaseRetry.length);
                setTimeout(connectToDatabase, 5000);
            }
            else {
                logger.error(runId + ": Failed to connect to database after " + databaseRetry.length + " attempts. Exiting application.");
                process.exit(1);
            }
        }
        else {
            logger.info(runId + ": Connected to database successfully");
            callback();
        }
    });
};
var removeCollectionData = function(inputs, callback) {
    var tracker = [];
    for (var i = 0; i < inputs.length; i++) {
        mongoose.connection.db.dropCollection(inputs[i].INPUT, function() {
            tracker.push(1);
            if (inputs.length == tracker.length) {
                callback();
            }
        });
    }
};
var checkForNewInputs = function(callback) {
    var inputs = [];
    var inputstream = fs.createReadStream('./settings/inputs.txt');
    csv
        .fromStream(inputstream, {
            headers: true
        })
        .on("data", function(data) {
            inputs.push(data);
        })
        .on("end", function() {
            if (inputs.length > 0) {
                logger.info(runId + ": Collected inputs successfully");
                callback(inputs);
            }
            else {
                logger.info(runId + ": No Inputs found to process");
                process.exit(1);
            }
        });
};
var createDirectories = function(inputs, callback) {
    var progress = [];
    for (var i = 0; i < inputs.length; i++) {
        var directory = "./input/" + inputs[i].INPUT;
        var archivedir = "./archive/" + inputs[i].INPUT;
        mkdirp(directory, function(err) {
            if (!err) {
                mkdirp(archivedir, function(err) {
                    if (!err) {
                        progress.push(1);
                        if (i == progress.length) {
                            logger.info(runId + ": Directories created successfully");
                            callback(inputs);
                        }
                    }
                    else {
                        logger.error(runId + ": An error occured creating directories");
                        process.exit(1);
                    }
                });
            }
            else {
                logger.error(runId + ": An error occured creating directories");
                process.exit(1);
            }
        });
    }
};
var processDirectories = function(inputs, callback) {
    var files = [];
    var filenames = [];

    var walker = walk.walk('./input', {
        followLinks: false
    });

    walker.on('file', function(root, stat, next) {
        files.push(root + '/' + stat.name);
        filenames.push(stat.name);
        next();
    });

    walker.on('end', function() {
        logger.info(runId + ": Filenames and directories collected successfully");
        callback(files, filenames, inputs);
    });
};
var processFiles = function(files, filenames, inputs, callback) {

    var _files = files;
    var _filesnames = filenames;
    var _inputs = inputs;

    removeCollectionData(inputs, function() {
        for (var i = 0; i < _files.length; i++) {
            var stream = fs.createReadStream(_files[i]);
            var currentFileName = _filesnames[i];
            var currentFile = _files[i];
            var inputType = parseFilePath(currentFile, _inputs);
            writeInputs(inputType, stream, currentFileName, _inputs, function(inputType) {
                if (_files.length == writeComplete.length) {
                    logger.info(runId + ": All files written to database successfully");
                    callback();
                }
            });
        }
    });
};


connectToDatabase(function() {
    checkForNewInputs(function(inputs) {
        createDirectories(inputs, function(inputs) {
            processDirectories(inputs, function(files, filenames, inputs) {
                processFiles(files, filenames, inputs, function() {
                    logger.info(runId + ": File management completed successfully");
                    process.exit(0);
                });
            });
        });
    });
});