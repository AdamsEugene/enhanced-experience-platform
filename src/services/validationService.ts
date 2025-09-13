import { InputType, ValidationConfig, ValidationResult } from "../types";

export class ValidationService {
  /**
   * Main validation function that validates user input based on input type and configuration
   */
  static validateInput(
    value: any,
    inputType: InputType,
    config: ValidationConfig = {},
    fieldName?: string
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitizedValue: value,
    };

    const fieldLabel = fieldName || "Field";

    // Handle required validation first
    if (config.required && this.isEmpty(value)) {
      result.isValid = false;
      result.errors.push(
        config.messages?.required || `${fieldLabel} is required`
      );
      return result;
    }

    // If value is empty and not required, it's valid (except for some special cases)
    if (this.isEmpty(value) && !config.required) {
      return result;
    }

    // Type-specific validation
    switch (inputType) {
      case "text":
      case "textarea":
      case "search":
        this.validateText(value, config, result, fieldLabel);
        break;

      case "number":
      case "range":
        this.validateNumber(value, config, result, fieldLabel);
        break;

      case "email":
        this.validateEmail(value, config, result, fieldLabel);
        break;

      case "password":
        this.validatePassword(value, config, result, fieldLabel);
        break;

      case "tel":
      case "phone":
        this.validatePhone(value, config, result, fieldLabel);
        break;

      case "url":
        this.validateUrl(value, config, result, fieldLabel);
        break;

      case "date":
      case "datetime-local":
      case "month":
      case "week":
      case "time":
        this.validateDateTime(value, inputType, config, result, fieldLabel);
        break;

      case "color":
        this.validateColor(value, config, result, fieldLabel);
        break;

      case "file":
        this.validateFile(value, config, result, fieldLabel);
        break;

      case "select":
      case "radio":
        this.validateSelect(value, config, result, fieldLabel);
        break;

      case "checkbox":
      case "toggle":
        this.validateCheckbox(value, config, result, fieldLabel);
        break;

      case "hidden":
      case "display":
        // These types don't need validation
        break;

      default:
        result.warnings?.push(`Unknown input type: ${inputType}`);
    }

    return result;
  }

  private static isEmpty(value: any): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value).length === 0;
    return false;
  }

  private static validateText(
    value: any,
    config: ValidationConfig,
    result: ValidationResult,
    fieldLabel: string
  ): void {
    const strValue = String(value).trim();
    result.sanitizedValue = strValue;

    // Length validation
    if (config.minLength && strValue.length < config.minLength) {
      result.isValid = false;
      result.errors.push(
        config.messages?.tooShort ||
          `${fieldLabel} must be at least ${config.minLength} characters`
      );
    }

    if (config.maxLength && strValue.length > config.maxLength) {
      result.isValid = false;
      result.errors.push(
        config.messages?.tooLong ||
          `${fieldLabel} must be no more than ${config.maxLength} characters`
      );
    }

    // Pattern validation
    if (config.pattern) {
      const regex = new RegExp(config.pattern);
      if (!regex.test(strValue)) {
        result.isValid = false;
        result.errors.push(
          config.messages?.invalidFormat || `${fieldLabel} format is invalid`
        );
      }
    }

    // Custom pattern validation
    if (config.customPatterns) {
      this.validateCustomPatterns(
        strValue,
        config.customPatterns,
        result,
        fieldLabel
      );
    }
  }

  private static validateNumber(
    value: any,
    config: ValidationConfig,
    result: ValidationResult,
    fieldLabel: string
  ): void {
    const numValue = Number(value);

    if (isNaN(numValue)) {
      result.isValid = false;
      result.errors.push(`${fieldLabel} must be a valid number`);
      return;
    }

    result.sanitizedValue = numValue;

    // Range validation
    if (config.min !== undefined && numValue < config.min) {
      result.isValid = false;
      result.errors.push(
        config.messages?.outOfRange ||
          `${fieldLabel} must be at least ${config.min}`
      );
    }

    if (config.max !== undefined && numValue > config.max) {
      result.isValid = false;
      result.errors.push(
        config.messages?.outOfRange ||
          `${fieldLabel} must be no more than ${config.max}`
      );
    }

    // Step validation
    if (config.step && config.min !== undefined) {
      const remainder = (numValue - config.min) % config.step;
      if (Math.abs(remainder) > 0.0001) {
        result.isValid = false;
        result.errors.push(
          `${fieldLabel} must be in increments of ${config.step}`
        );
      }
    }
  }

  private static validateEmail(
    value: any,
    config: ValidationConfig,
    result: ValidationResult,
    fieldLabel: string
  ): void {
    const strValue = String(value).trim().toLowerCase();
    result.sanitizedValue = strValue;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(strValue)) {
      result.isValid = false;
      result.errors.push(
        config.messages?.invalid ||
          `${fieldLabel} must be a valid email address`
      );
    }

    // Additional length validation
    if (config.maxLength && strValue.length > config.maxLength) {
      result.isValid = false;
      result.errors.push(`${fieldLabel} is too long`);
    }
  }

  private static validatePassword(
    value: any,
    config: ValidationConfig,
    result: ValidationResult,
    fieldLabel: string
  ): void {
    const strValue = String(value);

    // Length validation
    if (config.minLength && strValue.length < config.minLength) {
      result.isValid = false;
      result.errors.push(
        `${fieldLabel} must be at least ${config.minLength} characters`
      );
    }

    if (config.maxLength && strValue.length > config.maxLength) {
      result.isValid = false;
      result.errors.push(
        `${fieldLabel} must be no more than ${config.maxLength} characters`
      );
    }

    // Pattern validation for password strength
    if (config.pattern) {
      const regex = new RegExp(config.pattern);
      if (!regex.test(strValue)) {
        result.isValid = false;
        result.errors.push(
          config.messages?.invalidFormat ||
            `${fieldLabel} does not meet security requirements`
        );
      }
    }

    // Don't include password in sanitized value for security
    result.sanitizedValue = undefined;
  }

  private static validatePhone(
    value: any,
    config: ValidationConfig,
    result: ValidationResult,
    fieldLabel: string
  ): void {
    const strValue = String(value).trim();

    // Remove common phone formatting characters
    const cleanPhone = strValue.replace(/[\s\-\(\)\+\.]/g, "");

    let isValid = false;
    let sanitizedPhone = cleanPhone;

    switch (config.phoneFormat) {
      case "us":
        // US phone: 10 digits, optionally starting with 1
        const usRegex = /^1?[2-9]\d{2}[2-9]\d{2}\d{4}$/;
        isValid = usRegex.test(cleanPhone);
        if (isValid && cleanPhone.length === 11 && cleanPhone.startsWith("1")) {
          sanitizedPhone = cleanPhone.substring(1);
        }
        break;

      case "international":
        // International: 7-15 digits, may start with +
        const intlRegex = /^\+?[1-9]\d{6,14}$/;
        isValid = intlRegex.test(cleanPhone);
        break;

      case "any":
      default:
        // Any format: at least 7 digits
        const anyRegex = /^\+?[\d\s\-\(\)\.]{7,}$/;
        isValid = anyRegex.test(strValue) && cleanPhone.length >= 7;
        break;
    }

    if (!isValid) {
      result.isValid = false;
      result.errors.push(
        config.messages?.invalid || `${fieldLabel} must be a valid phone number`
      );
    } else {
      result.sanitizedValue = sanitizedPhone;
    }
  }

  private static validateUrl(
    value: any,
    config: ValidationConfig,
    result: ValidationResult,
    fieldLabel: string
  ): void {
    const strValue = String(value).trim();

    try {
      new URL(strValue);
      result.sanitizedValue = strValue;
    } catch {
      result.isValid = false;
      result.errors.push(
        config.messages?.invalid || `${fieldLabel} must be a valid URL`
      );
    }
  }

  private static validateDateTime(
    value: any,
    inputType: InputType,
    config: ValidationConfig,
    result: ValidationResult,
    fieldLabel: string
  ): void {
    const strValue = String(value).trim();
    let date: Date;

    try {
      // Handle different date/time formats
      switch (inputType) {
        case "date":
          // Format: YYYY-MM-DD
          if (!/^\d{4}-\d{2}-\d{2}$/.test(strValue)) {
            throw new Error("Invalid date format");
          }
          date = new Date(strValue + "T00:00:00");
          break;

        case "datetime-local":
          // Format: YYYY-MM-DDTHH:MM
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(strValue)) {
            throw new Error("Invalid datetime format");
          }
          date = new Date(strValue);
          break;

        case "time":
          // Format: HH:MM
          if (!/^\d{2}:\d{2}$/.test(strValue)) {
            throw new Error("Invalid time format");
          }
          // Create a date object for today with the specified time
          const today = new Date().toISOString().split("T")[0];
          date = new Date(`${today}T${strValue}:00`);
          break;

        case "month":
          // Format: YYYY-MM
          if (!/^\d{4}-\d{2}$/.test(strValue)) {
            throw new Error("Invalid month format");
          }
          date = new Date(strValue + "-01");
          break;

        case "week":
          // Format: YYYY-W##
          if (!/^\d{4}-W\d{2}$/.test(strValue)) {
            throw new Error("Invalid week format");
          }
          // Convert week to date (approximate)
          const [year, week] = strValue.split("-W");
          date = new Date(parseInt(year), 0, 1 + (parseInt(week) - 1) * 7);
          break;

        default:
          date = new Date(strValue);
      }

      if (isNaN(date.getTime())) {
        throw new Error("Invalid date");
      }

      result.sanitizedValue = strValue;

      // Date range validation
      if (config.minDate) {
        const minDate = new Date(config.minDate);
        if (date < minDate) {
          result.isValid = false;
          result.errors.push(`${fieldLabel} must be after ${config.minDate}`);
        }
      }

      if (config.maxDate) {
        const maxDate = new Date(config.maxDate);
        if (date > maxDate) {
          result.isValid = false;
          result.errors.push(`${fieldLabel} must be before ${config.maxDate}`);
        }
      }

      // Future/past validation
      const now = new Date();
      if (config.futureOnly && date <= now) {
        result.isValid = false;
        result.errors.push(`${fieldLabel} must be in the future`);
      }

      if (config.pastOnly && date >= now) {
        result.isValid = false;
        result.errors.push(`${fieldLabel} must be in the past`);
      }
    } catch (error) {
      result.isValid = false;
      result.errors.push(
        config.messages?.invalid || `${fieldLabel} must be a valid date/time`
      );
    }
  }

  private static validateColor(
    value: any,
    config: ValidationConfig,
    result: ValidationResult,
    fieldLabel: string
  ): void {
    const strValue = String(value).trim();

    // Hex color format: #RRGGBB or #RGB
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

    if (!hexRegex.test(strValue)) {
      result.isValid = false;
      result.errors.push(
        config.messages?.invalid ||
          `${fieldLabel} must be a valid color (hex format)`
      );
    } else {
      result.sanitizedValue = strValue.toLowerCase();
    }
  }

  private static validateFile(
    value: any,
    config: ValidationConfig,
    result: ValidationResult,
    fieldLabel: string
  ): void {
    // For file validation, we expect value to be a File object or file info
    if (!value) return;

    // If it's a File object (browser environment)
    if (typeof value === "object" && value.name && value.size !== undefined) {
      // File type validation
      if (config.allowedFileTypes && config.allowedFileTypes.length > 0) {
        const fileName = value.name.toLowerCase();
        const fileType = value.type || "";

        const isAllowed = config.allowedFileTypes.some((allowedType) => {
          if (allowedType.startsWith(".")) {
            return fileName.endsWith(allowedType.toLowerCase());
          }
          if (allowedType.includes("*")) {
            const baseType = allowedType.split("/")[0];
            return fileType.startsWith(baseType);
          }
          return fileType === allowedType;
        });

        if (!isAllowed) {
          result.isValid = false;
          result.errors.push(
            `${fieldLabel} must be one of: ${config.allowedFileTypes.join(
              ", "
            )}`
          );
        }
      }

      // File size validation
      if (config.maxFileSize && value.size > config.maxFileSize) {
        result.isValid = false;
        const maxSizeMB = (config.maxFileSize / (1024 * 1024)).toFixed(1);
        result.errors.push(`${fieldLabel} must be smaller than ${maxSizeMB}MB`);
      }
    }
  }

  private static validateSelect(
    value: any,
    config: ValidationConfig,
    result: ValidationResult,
    fieldLabel: string
  ): void {
    if (config.allowedValues && config.allowedValues.length > 0) {
      const strValue = String(value);
      if (!config.allowedValues.includes(strValue)) {
        result.isValid = false;
        result.errors.push(
          `${fieldLabel} must be one of: ${config.allowedValues.join(", ")}`
        );
      }
    }
  }

  private static validateCheckbox(
    value: any,
    config: ValidationConfig,
    result: ValidationResult,
    fieldLabel: string
  ): void {
    // For checkboxes, value can be boolean, array of strings, or single string
    let selections: string[] = [];

    if (typeof value === "boolean") {
      selections = value ? ["true"] : [];
    } else if (Array.isArray(value)) {
      selections = value.map((v) => String(v));
    } else if (value) {
      selections = [String(value)];
    }

    result.sanitizedValue = selections;

    // Validate allowed values
    if (config.allowedValues && config.allowedValues.length > 0) {
      const invalidSelections = selections.filter(
        (sel) => !config.allowedValues!.includes(sel)
      );
      if (invalidSelections.length > 0) {
        result.isValid = false;
        result.errors.push(
          `${fieldLabel} contains invalid selections: ${invalidSelections.join(
            ", "
          )}`
        );
      }
    }

    // Validate selection count
    if (config.minSelections && selections.length < config.minSelections) {
      result.isValid = false;
      result.errors.push(
        `${fieldLabel} requires at least ${config.minSelections} selections`
      );
    }

    if (config.maxSelections && selections.length > config.maxSelections) {
      result.isValid = false;
      result.errors.push(
        `${fieldLabel} allows at most ${config.maxSelections} selections`
      );
    }
  }

  private static validateCustomPatterns(
    value: string,
    patterns: NonNullable<ValidationConfig["customPatterns"]>,
    result: ValidationResult,
    fieldLabel: string
  ): void {
    if (patterns.name) {
      // Name validation: letters, spaces, hyphens, apostrophes
      const nameRegex = /^[a-zA-Z\s\-'\.]+$/;
      if (!nameRegex.test(value)) {
        result.isValid = false;
        result.errors.push(
          `${fieldLabel} must contain only letters, spaces, hyphens, and apostrophes`
        );
      }
    }

    if (patterns.address) {
      // Address validation: alphanumeric, spaces, common punctuation
      const addressRegex = /^[a-zA-Z0-9\s\-\#\.\,\/]+$/;
      if (!addressRegex.test(value)) {
        result.isValid = false;
        result.errors.push(
          `${fieldLabel} contains invalid characters for an address`
        );
      }
    }

    if (patterns.zipCode) {
      // US ZIP code: 12345 or 12345-6789
      const zipRegex = /^\d{5}(-\d{4})?$/;
      if (!zipRegex.test(value)) {
        result.isValid = false;
        result.errors.push(
          `${fieldLabel} must be a valid ZIP code (12345 or 12345-6789)`
        );
      }
    }

    if (patterns.ssn) {
      // SSN: XXX-XX-XXXX
      const ssnRegex = /^\d{3}-\d{2}-\d{4}$/;
      if (!ssnRegex.test(value)) {
        result.isValid = false;
        result.errors.push(`${fieldLabel} must be in format XXX-XX-XXXX`);
      }
    }

    if (patterns.creditCard) {
      // Basic credit card validation (Luhn algorithm would be better)
      const ccRegex = /^\d{13,19}$/;
      const cleanValue = value.replace(/\s/g, "");
      if (!ccRegex.test(cleanValue)) {
        result.isValid = false;
        result.errors.push(`${fieldLabel} must be a valid credit card number`);
      }
    }
  }
}
