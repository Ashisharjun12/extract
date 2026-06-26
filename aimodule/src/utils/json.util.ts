
export class JsonUtil {
  public static cleanAndParse(text: string): any {
    if (!text) {
      throw new Error('JSON_PARSE_ERROR: Empty text provided');
    }

    let cleanText = text.trim();

    // Extract JSON block if it exists (handles ```json ... ``` and ``` ... ```)
    const jsonMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonMatch && jsonMatch[1]) {
      cleanText = jsonMatch[1].trim();
    }

    try {
      return JSON.parse(cleanText);
    } catch (parseError: any) {
      console.error('Failed to parse JSON. Raw response:', cleanText);
      throw new Error(`JSON_PARSE_ERROR: ${parseError.message}`);
    }
  }
}
