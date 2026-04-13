import * as fs from "fs";
import * as path from "path";
import * as Handlebars from "handlebars";

export default class EmailTemplateCompiler {
  private static templateCache: Map<string, HandlebarsTemplateDelegate> =
    new Map();

  private static partialsRegistered = false;

  private static resolveTemplatePath(relativePath: string): string | null {
    const candidatePaths = [
      path.join(__dirname, relativePath),
      path.join(process.cwd(), "src", relativePath),
    ];

    for (const candidatePath of candidatePaths) {
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    return null;
  }

  static registerPartials(): void {
    if (this.partialsRegistered) {
      return;
    }

    try {
      const partialsDir = this.resolveTemplatePath("../templates/partials/");

      if (partialsDir) {
        const partialFiles = fs
          .readdirSync(partialsDir)
          .filter((file) => file.endsWith(".handlebars"));

        partialFiles.forEach((file) => {
          const partialName = file.replace(".handlebars", "");
          const partialPath = path.join(partialsDir, file);
          const partialContent = fs.readFileSync(partialPath, "utf8");

          Handlebars.registerPartial(partialName, partialContent);
        });

        console.log(
          `[EmailTemplateCompiler] Registered ${partialFiles.length} Handlebars partials`,
        );
      }

      this.partialsRegistered = true;
    } catch (error) {
      console.error(
        "[EmailTemplateCompiler] Failed to register partials:",
        error,
      );
    }
  }

  static compileTemplate(
    templateName: string,
  ): HandlebarsTemplateDelegate | null {
    try {
      const cached = this.templateCache.get(templateName);

      if (cached) {
        return cached;
      }

      this.registerPartials();

      const templatePath = this.resolveTemplatePath(
        `../templates/emails/${templateName}.handlebars`,
      );

      if (!templatePath) {
        console.error(
          `[EmailTemplateCompiler] Template not found: ${templateName}`,
        );
        return null;
      }

      const templateSource = fs.readFileSync(templatePath, "utf8");
      const template = Handlebars.compile(templateSource);

      this.templateCache.set(templateName, template);

      return template;
    } catch (error) {
      console.error(
        `[EmailTemplateCompiler] Failed to compile template ${templateName}:`,
        error,
      );
      return null;
    }
  }

  static renderTemplate(templateName: string, context: unknown): string | null {
    const template = this.compileTemplate(templateName);

    if (!template) {
      return null;
    }

    try {
      return template(context);
    } catch (error) {
      console.error(
        `[EmailTemplateCompiler] Failed to render template ${templateName}:`,
        error,
      );
      return null;
    }
  }
}
