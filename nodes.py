import os


class PromptPalette:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": (
                    "STRING",
                    {"default": "", "multiline": True},
                ),
                "delimiter": (
                    ["comma & line break", "comma", "line break", "space"],
                    {"default": "comma & line break"},
                ),
            },
            "optional": {"prefix": ("STRING", {"forceInput": True})},
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "process"
    CATEGORY = "utils"

    def process(self, text, delimiter, prefix=None):
        lines = text.split("\n")
        filtered_lines = []
        for line in lines:
            # Skip empty lines
            if not line.strip():
                continue
            # Skip commented lines
            if line.strip().startswith("//"):
                continue
            # Remove inline comments
            if "//" in line:
                line = line.split("//")[0].rstrip()
            # Add suffix based on delimiter setting
            if delimiter in ("comma & line break", "comma"):
                line = line + ", "
            elif delimiter == "space":
                line = line + " "
            # "line break" adds nothing
            filtered_lines.append(line)

        # Join lines based on delimiter setting
        if delimiter in ("comma & line break", "line break"):
            result = "\n".join(filtered_lines)
        else:
            # "comma" or "space": remove line breaks
            result = "".join(filtered_lines)

        # Add prefix if provided
        if prefix:
            if result:
                if delimiter in ("comma & line break", "line break"):
                    result = prefix + "\n" + result
                else:
                    result = prefix + result
            else:
                result = prefix

        return (result,)


NODE_CLASS_MAPPINGS = {"PromptPalette": PromptPalette}
NODE_DISPLAY_NAME_MAPPINGS = {"PromptPalette": "Prompt Palette"}
WEB_DIRECTORY = os.path.join(os.path.dirname(os.path.realpath(__file__)), "web")
