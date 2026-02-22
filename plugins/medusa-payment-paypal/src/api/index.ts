import { Router, type Router as ExpressRouter } from "express"
import hooks from "./routes/hooks"

export default (): ExpressRouter => {
  const app = Router()

  hooks(app)

  return app
}
