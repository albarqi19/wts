/**
 * @file ActivationCode.js
 * @description نموذج بيانات رموز التفعيل
 */

const mongoose = require('mongoose');

// مخطط رمز التفعيل
const activationCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        length: 6
    },
    deviceId: {
        type: String,
        default: null
    },
    isUsed: {
        type: Boolean,
        default: false
    },
    usedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    usedAt: {
        type: Date,
        default: null
    },
    expiresAt: {
        type: Date,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// التحقق من صلاحية الرمز
activationCodeSchema.methods.isValid = function() {
    return !this.isUsed && new Date() < this.expiresAt;
};

// تحديث الرمز عند استخدامه
activationCodeSchema.methods.markAsUsed = function(userId, deviceId) {
    this.isUsed = true;
    this.usedBy = userId;
    this.deviceId = deviceId;
    this.usedAt = new Date();
    return this.save();
};

// للتحقق من الأجهزة المصرح لها
activationCodeSchema.statics.isDeviceAuthorized = async function(deviceId) {
    const code = await this.findOne({ deviceId });
    return !!code;
};

const ActivationCode = mongoose.model('ActivationCode', activationCodeSchema);

module.exports = ActivationCode;