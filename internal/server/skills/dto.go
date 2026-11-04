package skills

import "github.com/ktsoator/threadmark/skills"

type Summary struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type Detail struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	Instructions string `json:"instructions"`
}

func fromSummaries(items []skills.Summary) []Summary {
	result := make([]Summary, 0, len(items))
	for _, item := range items {
		result = append(result, Summary(item))
	}
	return result
}
