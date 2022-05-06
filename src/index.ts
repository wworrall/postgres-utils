/**
 * Convert a camelCase string to snake_case
 */
function camelToSnakeCaseString(s: string) {
  return s.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

/**
 * convert an object with camelCase keys to snake_case keys.
 * Works recursively but not with arrays yet.
 */
function camelToSnakeCaseKeys(obj: object) {
  const converted: any = {};
  Object.entries(obj).forEach(([k, v]) => {
    const convertedKey = camelToSnakeCaseString(k);
    if (typeof v === "object" && v !== null && !(v instanceof Date)) {
      converted[convertedKey] = camelToSnakeCaseKeys(v);
    } else {
      converted[convertedKey] = v;
    }
  });

  return converted;
}

/**
 * Convert a snake_case string to camelCase.
 */
function snakeToCamelCaseString(s: string) {
  return s.replace(/_[a-z]/g, (match) => match.charAt(1).toUpperCase());
}

/**
 * Convert an object with snake_case keys to camelCase keys.
 * Works recursively but not with arrays yet.
 */
function snakeToCamelCaseKeys<T>(obj: T) {
  const converted: any = {};
  Object.entries(obj).forEach(([k, v]) => {
    const convertedKey = snakeToCamelCaseString(k);
    if (typeof v === "object" && v !== null && !(v instanceof Date)) {
      converted[convertedKey] = snakeToCamelCaseKeys(v);
    } else {
      converted[convertedKey] = v;
    }
  });

  return converted;
}

type WhereParams = {
  [column: string]: unknown;
};

type GetParamsForWhereOutput = { whereSegment: string; whereParams: unknown[] };

const COMPARISON_OPERATORS_MAP = {
  eq: "=",
  neq: "<>",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
  like: "LIKE",
  notLike: "NOT LIKE",
  ilike: "ILIKE",
  notIlike: "NOT ILIKE",
  in: "IN",
  notIn: "NOT IN",
  isNull: "IS NULL",
  isNotNull: "IS NOT NULL",
};

/**
 * Convert an object defining where conditions to a SQL WHERE clause.
 *
 * @param whereParams An object defining where conditions.
 * @param paramsOffset An optional offset to add to the parameter index.
 *
 * Keys for whereParams are camelCase column names and are optionally suffixed
 * with an operator separated from the column name by a colon:
 * - eq: `=` (default when no suffix provided)
 * - neq: `<>`
 * - lt: `<`
 * - lte: `<=`
 * - gt: `>`
 * - gte: `>=`
 * - like: `LIKE`
 * - notLike: `NOT LIKE`
 * - ilike: `ILIKE`
 * - notIlike: `NOT ILIKE`
 * - in: `IN`
 * - notIn: `NOT IN`
 * - isNull: `IS NULL`
 * - isNotNull: `IS NOT NULL`
 *
 * example whereParams:
 * ```
 *  {
 *   "age:gte": 18
 *  "age:lt": 65
 * }
 * ```
 *
 * converted to SQL:
 * ```
 * age >= $1
 * AND
 * age < $2
 * ```
 *
 */
function getWhereParams({
  whereParams,
  paramsOffset = 0,
}: {
  whereParams: WhereParams;
  paramsOffset?: number;
}): GetParamsForWhereOutput {
  const lines: string[] = [];
  const params: unknown[] = [];

  Object.entries(whereParams).forEach(([k, v]) => {
    let comparisonOperator = "=";
    let field = k;
    if (k.includes(":")) {
      const tokens = k.split(":");
      field = tokens[0];
      comparisonOperator =
        COMPARISON_OPERATORS_MAP[
          tokens[1] as keyof typeof COMPARISON_OPERATORS_MAP
        ];
      if (!comparisonOperator) throw new Error("Invalid comparison operator");
    }

    if (
      comparisonOperator === "IS NULL" ||
      comparisonOperator === "IS NOT NULL"
    ) {
      lines.push(`${camelToSnakeCaseString(field)} ${comparisonOperator}`);
    } else if (comparisonOperator === "IN" || comparisonOperator === "NOT IN") {
      const arrayParam = (v as string).split(",");
      lines.push(
        `${camelToSnakeCaseString(field)} ${comparisonOperator} (${arrayParam
          .map((_, i) => `$${params.length + paramsOffset + i + 1}`)
          .join(", ")})`
      );
      params.push(arrayParam);
    } else {
      params.push(v);
      lines.push(
        `${camelToSnakeCaseString(field)} ${comparisonOperator} $${
          params.length + paramsOffset
        }`
      );
    }
  });

  return { whereSegment: lines.join("\nAND\n"), whereParams: params };
}

type InsertParams = { [column: string]: unknown };
type GetParamsForInsertOutput = {
  columnsSegment: string;
  paramsSegment: string;
  values: unknown[];
};

/**
 * Convert an object to components used to insert a new row.
 *
 * @param insertParams An object defining the columns and values to insert.
 *
 * @returns An object with the following properties:
 * - columnsSegment: The SQL fragment for the columns.
 * - paramsSegment: The SQL fragment for the values.
 * - values: An array of values to insert.
 */
function getParamsForInsert(
  insertParams: InsertParams
): GetParamsForInsertOutput {
  const columnsSegmentTokens: string[] = [];
  const paramsSegmentTokens: string[] = [];
  const values: unknown[] = [];
  Object.entries(insertParams).forEach(([column, value], idx) => {
    const snakeCaseColumn = camelToSnakeCaseString(column);
    columnsSegmentTokens.push(snakeCaseColumn);
    paramsSegmentTokens.push(`$${idx + 1}`);
    values.push(value);
  });
  const columnsSegment = columnsSegmentTokens.join(", ");
  const paramsSegment = paramsSegmentTokens.join(", ");
  return { columnsSegment, paramsSegment, values };
}

type SetParams = { [column: string]: unknown };
type GetParamsForSetOutput = { sqlSegment: string; values: unknown[] };

/**
 * Convert an object to components used to update a row.
 *
 * @param setParams An object defining the columns and values to update.
 *
 * @returns An object with the following properties:
 * - setSegment: The SQL fragment for the set.
 * - values: An array of values to update.
 *
 */
function getParamsForSet(setParams: SetParams): GetParamsForSetOutput {
  const sqlSegmentTokens: string[] = [];
  const values: unknown[] = [];
  Object.entries(setParams).forEach(([column, value], idx) => {
    const snakeCaseColumn = camelToSnakeCaseString(column);
    sqlSegmentTokens.push(`${snakeCaseColumn}=$${idx + 1}`);
    values.push(value);
  });
  const sqlSegment = sqlSegmentTokens.join(", ");
  return { sqlSegment, values };
}

/**
 * Convert an array object returned by a Postgres SQL query to a javascript array.
 */
function arrayObjectToArray<T>(arrayObject: { [k: string]: T }): T[] {
  let stringKeys = Object.keys(arrayObject);

  // ensure ascending order
  stringKeys = stringKeys
    .map((stringKey) => parseInt(stringKey))
    .sort()
    .map((numericKey) => numericKey.toString());

  return stringKeys.map((stringKey) => arrayObject[stringKey]);
}

/**
 * A utility used to tag string literals and invoke syntax-highlighting
 */
const sql = String.raw;

export {
  arrayObjectToArray,
  camelToSnakeCaseKeys,
  camelToSnakeCaseString,
  getParamsForInsert,
  getParamsForSet,
  getWhereParams,
  snakeToCamelCaseKeys,
  snakeToCamelCaseString,
  sql,
};
