

// Find field by case-insensitive name match
function findFieldByName(fieldIds: Record<string, string>, fieldName: string): string | undefined {
    const lowerName = fieldName.toLowerCase();
    for (const [name, id] of Object.entries(fieldIds)) {
        if (name.toLowerCase() === lowerName) {
            return id;
        }
    }
    return undefined;
}

// Find select option by case-insensitive name match
function findSelectOptionByName(selectOptions: Record<string, Record<string, string>>, fieldName: string, optionName: string): string | undefined {
    const lowerFieldName = fieldName.toLowerCase();
    for (const [name, options] of Object.entries(selectOptions)) {
        if (name.toLowerCase() === lowerFieldName) {
            return options[optionName];
        }
    }
    return undefined;
}

export const helpers = {
    findFieldByName,
    findSelectOptionByName
}