var fs = require("fs"),
    mongoose = require("mongoose"),
    Schema = mongoose.Schema,
    csv = require("fast-csv"),
    walk = require('walk'),
    uploadModel = require('./models/uploadModel'),
    admzip = require('adm-zip');

var entrySchema = new Schema({}, {
    strict: false
});
var uploadSchema = new Schema({}, {
    strict: false
});

var hasher = require("./data/hasher");
var Entry = mongoose.model("schedule", entrySchema);
var files = [];
var filenames = [];
var currentFileName = "";
var newFileName = "";

mongoose.connect('mongodb://Woden:Brutus5hep@ds062807.mongolab.com:62807/calldata');
mongoose.connection.on("open", function(err, conn) {

    // Walker options
    var walker = walk.walk('./input', {
        followLinks: false
    });

    walker.on('file', function(root, stat, next) {
        // Add this file to the list of files
        files.push(root + '/' + stat.name);
        filenames.push(stat.name);
        next();
    });

    walker.on('end', function() {
        for (var i = 0; i < files.length; i++) {

            var stream = fs.createReadStream(files[i]);
            currentFileName = filenames[i];
            var header = [];

            csv
                .fromStream(stream, {
                    headers: true
                })
                .on("data", function(data) {

                    //create new schema and save data
                    var entry = new Entry(data);
                    entry.save(function(err, data) {
                        if (!err) {};
                    });

                    //check if header array is empty amd if so populate it
                    if (header.length == 0) {
                        for (var name in data) {
                            header.push(name);
                        }
                    }

                })
                .on("end", function() {

                    uploadModel.findOne({}, {}, {
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

                            var oldFilename = currentFileName;
                            var newFilename = hasher.createSalt() + '.' + oldFilename.split('.').pop();

                            var upload = new uploadModel();
                            upload.filename = newFilename;
                            upload.originalname = oldFilename;
                            upload.headers = header;
                            upload.logdate = new Date();
                            upload.folder = "input";
                            upload.changes = differences;

                            upload.save(function(err, result) {
                                if (!err) {
                                    var filetoZip = result.filename;
                                    newFileName = result.filename;
                                    fs.rename("./input/" + currentFileName, "./archive/" + result.filename, function(err, result) {
                                        if (!err) {
                                            var zip = new admzip();
                                            zip.addLocalFile("./archive/" + filetoZip);
                                            zip.writeZip("./archive/" + newFileName + ".zip", function(err, result) {
                                                if (!err) {
                                                    fs.unlink("./archive/" + newFileName, function(err) {
                                                        if (err) throw err;
                                                        console.log('Import Completed');
                                                        process.exit(0);
                                                    });
                                                }
                                            });
                                        }
                                        else {
                                            console.log(err);
                                        }
                                    });
                                }
                                else {
                                    console.log("error saving");
                                }
                            });
                        }
                        else {
                            console.log("error");
                        }
                    });
                });

        }
    });
});
