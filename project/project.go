// Package project defines project data and operations independently of storage and transport.
package project

import "time"

// Project associates an existing directory with an application and user.
type Project struct {
	ID        string
	AppName   string
	UserID    string
	Name      string
	Directory string
	CreatedAt time.Time
	UpdatedAt time.Time
}
