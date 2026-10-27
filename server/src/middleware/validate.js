/**
 * Zod Request Validation Middleware.
 */

export const validateBody = (schema) => {
  return async (req, res, next) => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      next();
    } catch (err) {
      if (err.errors) {
        const formattedErrors = err.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));
        return res.status(400).json({
          success: false,
          error_code: "VALIDATION_ERROR",
          message: formattedErrors[0]?.message || "Invalid request payload.",
          errors: formattedErrors,
        });
      }
      return res.status(400).json({
        success: false,
        error_code: "VALIDATION_ERROR",
        message: err.message || "Invalid request payload.",
      });
    }
  };
};
