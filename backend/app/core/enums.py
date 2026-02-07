from enum import Enum

class Status(str, Enum):
    BACKLOG = "Backlog"
    TODO = "Todo"
    IN_PROGRESS = "In Progress"
    ON_HOLD = "On hold"
    REVIEW = "Review"
    DONE = "Done"

class Priority(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    CRITICAL = "Critical"

class DependencyType(str, Enum):
    FS = "FS"
    SS = "SS"
    FF = "FF"
    SF = "SF"
