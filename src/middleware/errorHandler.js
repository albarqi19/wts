/**
 * @file errorHandler.js
 * @description Middleware لمعالجة الأخطاء في تطبيق Express.
 */

/**
 * Middleware لمعالجة مسارات API غير الموجودة (404).
 * @param {object} req - كائن الطلب.
 * @param {object} res - كائن الاستجابة.
 */
function handleNotFound(req, res) {
    res.status(404).json({ status: false, message: 'المسار غير موجود' });
}

/**
 * Middleware لمعالجة الأخطاء العامة في الخادم (500).
 * @param {Error} err - كائن الخطأ.
 * @param {object} req - كائن الطلب.
 * @param {object} res - كائن الاستجابة.
 * @param {function} next - الدالة التالية في سلسلة middleware.
 */
function handleServerError(err, req, res, next) {
    console.error('خطأ في الخادم:', err);
    // تجنب إرسال استجابة إذا تم إرسالها بالفعل
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({ status: false, message: 'خطأ في الخادم' });
}

module.exports = { handleNotFound, handleServerError };
