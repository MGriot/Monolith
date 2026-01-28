import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

function App() {
  return (
    <div className="p-8 flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Monolith Planner</h1>
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input placeholder="Enter something..." />
          <Button>Click Me</Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default App