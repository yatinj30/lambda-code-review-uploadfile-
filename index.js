const multipart = require('parse-multipart');
const AWS = require('aws-sdk');
const crypto = require('crypto');
const { v1: uuidv1 } = require('uuid');
require('dotenv').config();

const s3 = new AWS.S3({
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
});

const algorithm = "aes-256-cbc";
const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY, 'base64');
const publicAccessKey = Buffer.from(process.env.ENCRYPTION_ACCESS_KEY, 'base64');

exports.handler = async (event) => {
    try {
        //file fetching
        let bodyBuffer = new Buffer(event['body-json'].toString(), 'base64');
        let boundary = multipart.getBoundary(event.params.header['content-type']);
        let parts = multipart.Parse(bodyBuffer, boundary);

        let uuid = uuidv1();
        //file encryption
        let dataBase64 = parts[0].data.toString('base64');
        const cipher = crypto.createCipheriv(algorithm, encryptionKey, publicAccessKey);
        let encryptedData = cipher.update(dataBase64.toString(), "utf-8", "hex");
        encryptedData += cipher.final("hex");

        //single file fetching
        const s3Bucket = process.env.BUCKET_NAME;
        const objectName = `${uuid}.txt`;
        const objectData = encryptedData;
        const objectType = 'text/plain';
        const params = {
            Bucket: s3Bucket,
            Key: objectName,
            Body: objectData,
            ContentType: objectType,
            ContentEncoding: 'base64'
        };

        //s3 upload
        const result = await s3.putObject(params).promise();

        //dynamo db
        let dDB = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
        var dbParams = {
            TableName: 'LookUp',
            Item: {
                id: { S: uuid },
                name: { S: parts[0].filename },
                type: { S: parts[0].type }
            }
        };
        const data = await dDB.putItem(dbParams).promise();
        if (data) {
            return sendRes(200, `File uploaded successfully at https:/` + s3Bucket + `.s3.amazonaws.com/` + objectName);
        } else {
            return sendRes(404, "File not uploaded");
        }
    } catch (error) {
        return sendRes(404, error);
    }
};

const sendRes = (status, body) => {
    var response = {
        statusCode: status,
        body: body
    };
    return response;
};